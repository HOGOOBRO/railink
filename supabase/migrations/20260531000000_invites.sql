-- Personal track, PR-2: invite links.
--
-- An invite is a single-use, 14-day token an existing user creates to pull a
-- friend/colleague in. On signup the new user calls consume_invite(token),
-- which creates a BIDIRECTIONAL accepted schedule_shares pair (clicking the
-- link stands in for both sides' consent). Invite issuing is equal for every
-- account — KTX or personal — so a personal user can invite another personal
-- user. consume_invite is track-agnostic: it never branches on profile_type.
--
-- Deviations from the planning doc §2.2 (deliberate, to match the real schema):
--   * schedule_shares has NO `accepted_at` column — the real column is
--     `responded_at` (see 20260526000000_visibility_and_shares.sql). The plan's
--     SQL would error "column accepted_at does not exist"; we use responded_at.
--   * Token uses gen_random_uuid() (pg_catalog core, always resolvable under
--     `search_path = public`) instead of gen_random_bytes() (pgcrypto, which
--     lives in the `extensions` schema and would NOT resolve here).

create table if not exists public.invites (
  token          text primary key,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  owner_group_id text,                 -- localStorage groupId, for owner-side auto-add
  invitee_email  text,                 -- optional; NULL = anyone can use it
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '14 days'),
  used_at        timestamptz,
  used_by        uuid references auth.users(id),
  revoked_at     timestamptz
);

create index if not exists invites_owner_id_idx on public.invites(owner_id);

alter table public.invites enable row level security;

-- Owner can read their own invites (for the "내 초대" list / revoke). All writes
-- go through the SECURITY DEFINER RPCs below — no write policy is granted.
drop policy if exists invites_select_own on public.invites;
create policy invites_select_own
on public.invites
for select
to authenticated
using (owner_id = auth.uid());

grant select on public.invites to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: create an invite token (rate-limited to 10/day per owner)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_invite(
  group_id_param      text default null,
  invitee_email_param text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token    text;
  recent_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select count(*) into recent_count
    from public.invites
   where owner_id = auth.uid()
     and created_at > now() - interval '1 day';
  if recent_count >= 10 then
    raise exception 'invite_rate_limit';
  end if;

  -- 128-bit random hex token. gen_random_uuid() is core (pg_catalog) so it
  -- resolves under search_path=public; encode/gen_random_bytes would not.
  loop
    new_token := replace(gen_random_uuid()::text, '-', '');
    exit when not exists (select 1 from public.invites where token = new_token);
  end loop;

  insert into public.invites (token, owner_id, owner_group_id, invitee_email)
  values (
    new_token,
    auth.uid(),
    nullif(trim(group_id_param), ''),
    lower(nullif(trim(invitee_email_param), ''))
  );

  return new_token;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: consume a token (called right after signup / email verification)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.consume_invite(token_param text)
returns table (
  owner_id       uuid,
  owner_name     text,
  owner_group_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv          public.invites%rowtype;
  viewer_id    uuid := auth.uid();
  viewer_email text;
begin
  if viewer_id is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from public.invites where token = token_param;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if inv.used_at is not null then
    raise exception 'invite_used';
  end if;
  if inv.revoked_at is not null then
    raise exception 'invite_revoked';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if inv.owner_id = viewer_id then
    raise exception 'invite_self';
  end if;

  if inv.invitee_email is not null then
    select email into viewer_email from auth.users where id = viewer_id;
    if lower(viewer_email) <> inv.invitee_email then
      raise exception 'invite_email_mismatch';
    end if;
  end if;

  -- Bidirectional accepted shares. Column is responded_at (NOT accepted_at).
  -- requested_at uses its table default.
  insert into public.schedule_shares (owner_id, viewer_id, status, responded_at)
  values (inv.owner_id, viewer_id, 'accepted', now())
  on conflict (owner_id, viewer_id) do update
    set status = 'accepted', responded_at = now();

  insert into public.schedule_shares (owner_id, viewer_id, status, responded_at)
  values (viewer_id, inv.owner_id, 'accepted', now())
  on conflict (owner_id, viewer_id) do update
    set status = 'accepted', responded_at = now();

  update public.invites
     set used_at = now(), used_by = viewer_id
   where token = token_param;

  return query
    select p.id, p.name, inv.owner_group_id
      from public.profiles p
     where p.id = inv.owner_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: revoke an invite (owner only, idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.revoke_invite(token_param text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.invites
     set revoked_at = coalesce(revoked_at, now())
   where token = token_param
     and owner_id = auth.uid()
     and used_at is null;
end;
$$;

revoke all on function public.create_invite(text, text) from public;
grant execute on function public.create_invite(text, text) to authenticated;
revoke all on function public.consume_invite(text) from public;
grant execute on function public.consume_invite(text) to authenticated;
revoke all on function public.revoke_invite(text) from public;
grant execute on function public.revoke_invite(text) to authenticated;
