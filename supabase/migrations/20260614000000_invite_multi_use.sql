-- Multi-use invite links (단톡 시나리오): one link in a group chat that up to N
-- people can accept, instead of the original single-use token.
--
-- Why
-- ───
-- A single-use link only connects the FIRST person who clicks; everyone else in
-- a 단톡 hits invite_used. To let one shared link pull in a whole group, an invite
-- now has a USE CAP (max_uses) and a running USE COUNT instead of a boolean
-- used_at. New links are created with max_uses = 30; existing rows keep the old
-- single-use behaviour (max_uses defaults to 1, see backfill below).
--
-- "Exhausted" now means use_count >= max_uses (was: used_at IS NOT NULL). used_at
-- / used_by are kept as informational "last consumed at / by" fields. The cap is
-- enforced ATOMICALLY (UPDATE ... WHERE use_count < max_uses; check FOUND) so a
-- burst of concurrent accepts can't overshoot 30. A repeat click by someone who
-- is ALREADY connected to the inviter does NOT burn a slot (dedup on the existing
-- accepted schedule_shares pair) — this also stops the signup-trigger + client
-- fallback from double-counting the same new user.
--
-- Leaked-link mitigation: the link is bounded (≤ max_uses, 14-day expiry) and
-- revoke_invite now works on a PARTIALLY-used link too, so a leaked link can be
-- killed for any future joiners (already-connected people stay — revocation is
-- forward-only, same as before).

-- ─────────────────────────────────────────────────────────────────────────────
-- Schema: add the cap + counter, then backfill so old USED links stay exhausted.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.invites
  add column if not exists max_uses  int not null default 1,
  add column if not exists use_count int not null default 0;

-- Existing single-use rows: a consumed one (used_at set) must NOT reappear as
-- available under the new use_count rule. Mark it exhausted (use_count = max_uses
-- = 1). Unused old rows stay at use_count 0 < max_uses 1 → still good for 1 use.
update public.invites
   set use_count = max_uses
 where used_at is not null
   and use_count = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- create_invite: new links get max_uses = 30. (10/day creation rate-limit kept.)
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

  loop
    new_token := replace(gen_random_uuid()::text, '-', '');
    exit when not exists (select 1 from public.invites where token = new_token);
  end loop;

  insert into public.invites (token, owner_id, owner_group_id, invitee_email, max_uses)
  values (
    new_token,
    auth.uid(),
    nullif(trim(group_id_param), ''),
    lower(nullif(trim(invitee_email_param), '')),
    30
  );

  return new_token;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- consume_invite: cap-aware. Return type unchanged (inviter_* from 20260601010000)
-- so CREATE OR REPLACE keeps the existing grants.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.consume_invite(token_param text)
returns table (
  inviter_id       uuid,
  inviter_name     text,
  inviter_group_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv     public.invites%rowtype;
  v_id    uuid := auth.uid();
  v_email text;
begin
  if v_id is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from public.invites where token = token_param;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if inv.revoked_at is not null then
    raise exception 'invite_revoked';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if inv.owner_id = v_id then
    raise exception 'invite_self';
  end if;

  if inv.invitee_email is not null then
    select email into v_email from auth.users where id = v_id;
    if lower(v_email) <> inv.invitee_email then
      raise exception 'invite_email_mismatch';
    end if;
  end if;

  -- Already connected to this inviter (e.g. repeat click, or the signup trigger
  -- ran first)? Then this is a no-op — don't burn a cap slot. Otherwise claim a
  -- slot atomically; the WHERE guard makes concurrent accepts safe against the cap.
  if not exists (
    select 1 from public.schedule_shares
     where owner_id = inv.owner_id and viewer_id = v_id and status = 'accepted'
  ) then
    update public.invites
       set use_count = use_count + 1,
           used_at   = now(),
           used_by   = v_id
     where token = token_param
       and use_count < max_uses;
    if not found then
      raise exception 'invite_full';
    end if;
  end if;

  -- Bidirectional accepted shares (idempotent). Column is responded_at.
  insert into public.schedule_shares (owner_id, viewer_id, status, responded_at)
  values (inv.owner_id, v_id, 'accepted', now())
  on conflict (owner_id, viewer_id) do update
    set status = 'accepted', responded_at = now();

  insert into public.schedule_shares (owner_id, viewer_id, status, responded_at)
  values (v_id, inv.owner_id, 'accepted', now())
  on conflict (owner_id, viewer_id) do update
    set status = 'accepted', responded_at = now();

  return query
    select p.id, p.name, inv.owner_group_id
      from public.profiles p
     where p.id = inv.owner_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- consume_invite_on_signup trigger: same cap logic, but NEVER block signup — a
-- full/expired/revoked token just no-ops (return new). The client-side
-- consume_invite fallback dedups on the shares this creates, so no double-count.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.consume_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tok text := nullif(trim(new.raw_user_meta_data ->> 'invite_token'), '');
  inv public.invites%rowtype;
begin
  if tok is null then
    return new;
  end if;

  select * into inv from public.invites where token = tok;
  if not found then return new; end if;                  -- unknown token
  if inv.revoked_at is not null then return new; end if; -- revoked
  if inv.expires_at < now() then return new; end if;     -- expired
  if inv.owner_id = new.id then return new; end if;      -- self (shouldn't happen)

  if inv.invitee_email is not null
     and lower(new.email) <> inv.invitee_email then
    return new;
  end if;

  -- Atomically claim a slot; if the cap is full, no-op (don't block signup).
  update public.invites
     set use_count = use_count + 1,
         used_at   = now(),
         used_by   = new.id
   where token = tok
     and use_count < max_uses;
  if not found then return new; end if;

  insert into public.schedule_shares (owner_id, viewer_id, status, responded_at)
  values (inv.owner_id, new.id, 'accepted', now())
  on conflict (owner_id, viewer_id) do update
    set status = 'accepted', responded_at = now();

  insert into public.schedule_shares (owner_id, viewer_id, status, responded_at)
  values (new.id, inv.owner_id, 'accepted', now())
  on conflict (owner_id, viewer_id) do update
    set status = 'accepted', responded_at = now();

  return new;
exception
  when others then
    return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- peek_invite: "usable" now means not-full (was: used_at IS NULL).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.peek_invite(token_param text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invites%rowtype;
  owner_name text;
begin
  select * into inv from public.invites where token = token_param;
  if not found then return null; end if;
  if inv.use_count >= inv.max_uses
     or inv.revoked_at is not null
     or inv.expires_at < now() then
    return null;
  end if;
  select name into owner_name from public.profiles where id = inv.owner_id;
  return owner_name;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- revoke_invite: now works on a PARTIALLY-used link too, so a leaked multi-use
-- link can be killed for future joiners. (Dropped the `used_at is null` guard.)
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
     and owner_id = auth.uid();
end;
$$;
