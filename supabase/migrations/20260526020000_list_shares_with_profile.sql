-- list_my_shares_with_profile(): my share rows joined to the counterparty's
-- exposed profile fields, so the settings "공유 중인 동료" section can render a
-- name even for pending / private counterparties whose profile row is otherwise
-- hidden by the profiles RLS policy.
--
-- SECURITY DEFINER so the profiles join bypasses RLS, but scoped to exactly the
-- same rows as the shares_select_self policy: rows where the caller is either
-- the owner or the viewer. The counterparty is the *other* party.

create or replace function public.list_my_shares_with_profile()
returns table (
  owner_id                uuid,
  viewer_id               uuid,
  status                  text,
  requested_at            timestamptz,
  responded_at            timestamptz,
  counterpart_id          uuid,
  counterpart_name        text,
  counterpart_employee_id text,
  counterpart_part        text,
  counterpart_photo       text,
  counterpart_visibility  text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  return query
    select
      s.owner_id,
      s.viewer_id,
      s.status,
      s.requested_at,
      s.responded_at,
      p.id,
      p.name,
      p.employee_id,
      p.part,
      p.photo,
      p.visibility
    from public.schedule_shares s
    join public.profiles p
      on p.id = case when s.owner_id = auth.uid() then s.viewer_id else s.owner_id end
    where auth.uid() in (s.owner_id, s.viewer_id);
end;
$$;

revoke all on function public.list_my_shares_with_profile() from public;
grant execute on function public.list_my_shares_with_profile() to authenticated;
