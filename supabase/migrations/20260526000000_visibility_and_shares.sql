-- Selective schedule sharing (consent-based).
--
-- Model:
--   profiles.visibility            'public' | 'private'   (search/listing only)
--   schedule_shares (per-pair)     consent for the *data* itself
--
-- Visibility and data access are intentionally decoupled: even a 'public'
-- profile must accept a share before anyone can see their schedule rows.
-- Writes to schedule_shares go through SECURITY DEFINER RPCs so the rules
-- (who can request, who can accept) live in one place.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) profiles.visibility
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists visibility text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_visibility_check'
  ) then
    alter table public.profiles
      add constraint profiles_visibility_check
      check (visibility in ('public','private'));
  end if;
end$$;

-- Backfill from the legacy share_schedule flag:
--   share_schedule=true  → public  (the user was already exposing themselves)
--   share_schedule=false → private (preserve the opt-out)
-- share_schedule itself stays in place for now and is dropped in a later
-- migration once the app no longer reads/writes it.
update public.profiles
set visibility = case when share_schedule then 'public' else 'private' end
where visibility = 'public'  -- only touch rows still at the default
  and share_schedule is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) schedule_shares table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.schedule_shares (
  owner_id      uuid not null references auth.users(id) on delete cascade,
  viewer_id     uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending',
  requested_at  timestamptz not null default now(),
  responded_at  timestamptz,
  primary key (owner_id, viewer_id),
  constraint schedule_shares_status_check
    check (status in ('pending','accepted','revoked')),
  constraint schedule_shares_not_self
    check (owner_id <> viewer_id)
);

create index if not exists schedule_shares_viewer_status_idx
  on public.schedule_shares (viewer_id, status);

create index if not exists schedule_shares_owner_status_idx
  on public.schedule_shares (owner_id, status);

alter table public.schedule_shares enable row level security;

-- Each user can read rows where they are either party. All writes are
-- funneled through RPCs below — direct INSERT/UPDATE/DELETE are blocked
-- (no policy granted), which lets the policy stay small and auditable.
drop policy if exists shares_select_self on public.schedule_shares;
create policy shares_select_self
on public.schedule_shares
for select
to authenticated
using (auth.uid() in (owner_id, viewer_id));

grant select on public.schedule_shares to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Replace schedules SELECT policy:
--    own rows OR an accepted share row exists from owner → me
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists schedules_select_shared_or_own on public.schedules;
create policy schedules_select_shared_or_own
on public.schedules
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.schedule_shares s
    where s.owner_id   = schedules.user_id
      and s.viewer_id  = auth.uid()
      and s.status     = 'accepted'
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Tighten profiles SELECT:
--    public non-admin profiles, my own profile, or a profile connected to me
--    via an accepted share (either direction — so the directory keeps showing
--    private contacts I'm already sharing with).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (
  (is_admin = false and visibility = 'public')
  or auth.uid() = id
  or exists (
    select 1
    from public.schedule_shares s
    where s.status = 'accepted'
      and (
        (s.owner_id  = profiles.id and s.viewer_id = auth.uid())
        or
        (s.viewer_id = profiles.id and s.owner_id  = auth.uid())
      )
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RPCs (write path)
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a) viewer → owner: send (or re-send after a previous revoke) a share request
create or replace function public.request_schedule_share(target_owner_id uuid)
returns public.schedule_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.schedule_shares;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if target_owner_id is null or target_owner_id = auth.uid() then
    raise exception 'invalid target';
  end if;

  -- Owner must exist and not be an admin account.
  if not exists (
    select 1 from public.profiles p
    where p.id = target_owner_id and p.is_admin = false
  ) then
    raise exception 'owner not found';
  end if;

  insert into public.schedule_shares (owner_id, viewer_id, status, requested_at)
  values (target_owner_id, auth.uid(), 'pending', now())
  on conflict (owner_id, viewer_id) do update
    set status       = case
                         when public.schedule_shares.status = 'revoked'
                           then 'pending'
                         else public.schedule_shares.status
                       end,
        requested_at = case
                         when public.schedule_shares.status = 'revoked'
                           then now()
                         else public.schedule_shares.requested_at
                       end,
        responded_at = case
                         when public.schedule_shares.status = 'revoked'
                           then null
                         else public.schedule_shares.responded_at
                       end
  returning * into result;

  return result;
end;
$$;

-- 5b) owner: accept or decline a pending request (also used to revoke later)
create or replace function public.respond_schedule_share(
  target_viewer_id uuid,
  accept boolean
)
returns public.schedule_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.schedule_shares;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update public.schedule_shares
     set status       = case when accept then 'accepted' else 'revoked' end,
         responded_at = now()
   where owner_id  = auth.uid()
     and viewer_id = target_viewer_id
  returning * into result;

  if result.owner_id is null then
    raise exception 'share request not found';
  end if;
  return result;
end;
$$;

-- 5c) viewer: cancel my pending request, or stop following an accepted share
create or replace function public.cancel_schedule_share(target_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  delete from public.schedule_shares
   where owner_id  = target_owner_id
     and viewer_id = auth.uid();
end;
$$;

-- 5d) Lookup a profile by exact employee_id (so private accounts can still be
--     found when the requester knows the sabun, and a request can be sent).
create or replace function public.find_profile_by_employee_id(
  target_employee_id text
)
returns table (
  id          uuid,
  name        text,
  employee_id text,
  part        text,
  photo       text,
  visibility  text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if coalesce(trim(target_employee_id), '') = '' then
    return;
  end if;

  return query
    select p.id, p.name, p.employee_id, p.part, p.photo, p.visibility
      from public.profiles p
     where p.is_admin    = false
       and p.employee_id = trim(target_employee_id)
     limit 1;
end;
$$;

-- 5e) Profile visibility setter (so the UI doesn't write the column directly
--     and we can add audit hooks later if needed).
create or replace function public.set_profile_visibility(new_visibility text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if new_visibility not in ('public','private') then
    raise exception 'invalid visibility';
  end if;

  update public.profiles
     set visibility = new_visibility
   where id = auth.uid();

  return new_visibility;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Grants
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.request_schedule_share(uuid)              from public;
revoke all on function public.respond_schedule_share(uuid, boolean)     from public;
revoke all on function public.cancel_schedule_share(uuid)               from public;
revoke all on function public.find_profile_by_employee_id(text)         from public;
revoke all on function public.set_profile_visibility(text)              from public;

grant execute on function public.request_schedule_share(uuid)           to authenticated;
grant execute on function public.respond_schedule_share(uuid, boolean)  to authenticated;
grant execute on function public.cancel_schedule_share(uuid)            to authenticated;
grant execute on function public.find_profile_by_employee_id(text)      to authenticated;
grant execute on function public.set_profile_visibility(text)           to authenticated;
