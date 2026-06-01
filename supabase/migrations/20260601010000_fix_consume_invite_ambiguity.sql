-- Fix: consume_invite raised 42702 "column reference owner_id is ambiguous".
--
-- The function's RETURNS TABLE columns were named owner_id / owner_group_id,
-- which collide with public.schedule_shares.owner_id (and invites.owner_group_id)
-- used unqualified in the INSERT ... ON CONFLICT target. PL/pgSQL couldn't tell
-- the OUT variable from the table column. (The other share RPCs return the
-- composite type public.schedule_shares, so they never hit this.)
--
-- Rename every OUT param and local var so NO identifier collides with a column:
-- OUT inviter_id/inviter_name/inviter_group_id, locals v_id/v_email. Behavior is
-- otherwise identical to 20260531000000.
--
-- Client (lib/store/invites.ts) reads the renamed result keys.
--
-- Renaming OUT params changes the return row type, so CREATE OR REPLACE is
-- rejected (42P13) — DROP first, then recreate, then re-grant (DROP drops the
-- grants too).

drop function if exists public.consume_invite(text);

create function public.consume_invite(token_param text)
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
  if inv.used_at is not null then
    raise exception 'invite_used';
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

  insert into public.schedule_shares (owner_id, viewer_id, status, responded_at)
  values (inv.owner_id, v_id, 'accepted', now())
  on conflict (owner_id, viewer_id) do update
    set status = 'accepted', responded_at = now();

  insert into public.schedule_shares (owner_id, viewer_id, status, responded_at)
  values (v_id, inv.owner_id, 'accepted', now())
  on conflict (owner_id, viewer_id) do update
    set status = 'accepted', responded_at = now();

  update public.invites
     set used_at = now(), used_by = v_id
   where token = token_param;

  return query
    select p.id, p.name, inv.owner_group_id
      from public.profiles p
     where p.id = inv.owner_id;
end;
$$;

-- Re-grant (DROP removed the original grants from 20260531000000).
revoke all on function public.consume_invite(text) from public;
grant execute on function public.consume_invite(text) to authenticated;
