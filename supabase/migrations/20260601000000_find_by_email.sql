-- Personal track, PR-5: exact email lookup.
--
-- Mirrors find_profile_by_employee_id: exact match only (no LIKE/partial), admin
-- excluded, email normalized (lower+trim). Visibility-agnostic on an exact match
-- (same policy as 사번 search) — so a private personal user IS reachable by their
-- exact email but NOT by name. Also returns profile_type so the search card can
-- show the right identity badge (KTX chip vs none).

create or replace function public.find_profile_by_email(target_email text)
returns table (
  id uuid,
  name text,
  employee_id text,
  part text,
  photo text,
  visibility text,
  profile_type text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  needle text := lower(coalesce(trim(target_email), ''));
begin
  if needle = '' then
    return;
  end if;

  return query
    select p.id, p.name, p.employee_id, p.part, p.photo, p.visibility, p.profile_type
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.is_admin = false
       and lower(u.email) = needle;
end;
$$;

revoke all on function public.find_profile_by_email(text) from public;
grant execute on function public.find_profile_by_email(text) to authenticated;
