-- Personal track, PR-3 follow-up: resolve an inviter's display name BEFORE auth.
--
-- The /signup?invite=TOKEN header wants to read "민준 님이 RaiLink로 초대했어요."
-- but the visitor isn't logged in yet, so they can't read profiles (RLS). This
-- SECURITY DEFINER function returns ONLY the owner's display name for a token
-- that is still usable (exists, not used/revoked/expired), and nothing else.
-- It is granted to anon as well — anyone holding the token already has the link,
-- so exposing just the inviter's name to them is acceptable. Returns NULL for
-- any unusable/unknown token, so the header falls back to name-agnostic copy.

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
  if inv.used_at is not null or inv.revoked_at is not null or inv.expires_at < now() then
    return null;
  end if;
  select name into owner_name from public.profiles where id = inv.owner_id;
  return owner_name;
end;
$$;

revoke all on function public.peek_invite(text) from public;
grant execute on function public.peek_invite(text) to anon, authenticated;
