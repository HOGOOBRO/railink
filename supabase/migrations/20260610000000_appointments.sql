-- 약속 잡기 (appointments) — backend for the appointment-pinning feature.
--
-- Model:
--   appointments               one event (group | solo) owned by its creator
--   appointment_participants    membership + consent (pending | accepted | declined)
--
--   group: owner invites participants → each starts 'pending'. Pending
--     participants STILL appear on the shared calendar (marked pending) so they
--     can be nudged to accept — they just haven't confirmed yet.
--   solo : participants = [owner] only. Colleagues with an ACCEPTED schedule_share
--     from the owner may see it — as "busy" (title/place/memo hidden) or full
--     "title", per appointments.visibility. Column-level masking is done in the
--     read RPC (RLS can't hide a column), so the title is never sent to a viewer
--     who isn't entitled to it.
--
-- All writes go through SECURITY DEFINER RPCs; tables have SELECT-only RLS.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('group','solo')),
  appt_date   date not null,
  title       text not null,
  start_time  text,
  end_time    text,
  place       text,
  memo        text,
  visibility  text check (visibility in ('busy','title')),   -- solo only
  created_at  timestamptz not null default now()
);
create index if not exists appointments_owner_date_idx on public.appointments (owner_id, appt_date);
create index if not exists appointments_date_idx on public.appointments (appt_date);

create table if not exists public.appointment_participants (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  status         text not null default 'pending'
                 check (status in ('pending','accepted','declined')),
  created_at     timestamptz not null default now(),
  primary key (appointment_id, user_id)
);
create index if not exists appt_participants_user_idx on public.appointment_participants (user_id, status);

alter table public.appointments enable row level security;
alter table public.appointment_participants enable row level security;

grant select on public.appointments to authenticated;
grant select on public.appointment_participants to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) RLS — direct SELECT only (owner / participant). Solo-to-colleague visibility
--    is served ONLY through appointments_for_month() so the title can be masked.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists appointments_select_member on public.appointments;
create policy appointments_select_member
on public.appointments
for select
to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.appointment_participants ap
    where ap.appointment_id = appointments.id
      and ap.user_id = auth.uid()
  )
);

drop policy if exists appt_participants_select on public.appointment_participants;
create policy appt_participants_select
on public.appointment_participants
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.appointments a
    where a.id = appointment_participants.appointment_id
      and a.owner_id = auth.uid()
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Write RPCs (SECURITY DEFINER — bypass RLS, enforce rules here)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_appointment(
  p_type       text,
  p_date       date,
  p_title      text,
  p_start      text,
  p_end        text,
  p_place      text,
  p_memo       text,
  p_visibility text,
  p_participants uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_pid uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_type not in ('group','solo') then raise exception 'invalid type'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'title required'; end if;

  insert into public.appointments (owner_id, type, appt_date, title, start_time, end_time, place, memo, visibility)
  values (
    v_uid, p_type, p_date, btrim(p_title),
    nullif(btrim(coalesce(p_start, '')), ''),
    nullif(btrim(coalesce(p_end,   '')), ''),
    nullif(btrim(coalesce(p_place, '')), ''),
    nullif(btrim(coalesce(p_memo,  '')), ''),
    case when p_type = 'solo' then coalesce(p_visibility, 'busy') else null end
  )
  returning id into v_id;

  -- owner is always an accepted participant
  insert into public.appointment_participants (appointment_id, user_id, status)
  values (v_id, v_uid, 'accepted');

  -- group: invite the rest as pending (skip self / dups)
  if p_type = 'group' and p_participants is not null then
    foreach v_pid in array p_participants loop
      if v_pid is not null and v_pid <> v_uid then
        insert into public.appointment_participants (appointment_id, user_id, status)
        values (v_id, v_pid, 'pending')
        on conflict (appointment_id, user_id) do nothing;
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

create or replace function public.delete_appointment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- owner only (cascade removes participants)
  delete from public.appointments where id = p_id and owner_id = auth.uid();
end;
$$;

create or replace function public.respond_appointment(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.appointment_participants
     set status = case when p_accept then 'accepted' else 'declined' end
   where appointment_id = p_id
     and user_id = auth.uid();
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Read RPC — month window, with solo 'busy' column masking.
--    Returns a jsonb array; title/place/memo are nulled for viewers not entitled
--    to the content (solo busy, or solo title without an accepted share).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.appointments_for_month(p_year int, p_month int)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',          v.id,
      'ownerId',     v.owner_id,
      'type',        v.type,
      'date',        to_char(v.appt_date, 'YYYY-MM-DD'),
      'title',       case when v.entitled then v.title else null end,
      'start',       v.start_time,
      'end',         v.end_time,
      'place',       case when v.entitled then v.place else null end,
      'memo',        case when v.entitled then v.memo  else null end,
      'visibility',  v.visibility,
      'myStatus',    (select ap.status from public.appointment_participants ap
                       where ap.appointment_id = v.id and ap.user_id = auth.uid()),
      'participants', (
        select coalesce(jsonb_agg(jsonb_build_object('uid', ap.user_id, 'status', ap.status)), '[]'::jsonb)
        from public.appointment_participants ap where ap.appointment_id = v.id
      )
    )
  ), '[]'::jsonb)
  from (
    select a.*,
      (
        a.owner_id = auth.uid()
        or exists (select 1 from public.appointment_participants ap
                   where ap.appointment_id = a.id and ap.user_id = auth.uid())
        or (a.type = 'solo' and a.visibility = 'title'
            and exists (select 1 from public.schedule_shares s
                        where s.owner_id = a.owner_id and s.viewer_id = auth.uid() and s.status = 'accepted'))
      ) as entitled
    from public.appointments a
    where a.appt_date >= make_date(p_year, p_month, 1)
      and a.appt_date <  (make_date(p_year, p_month, 1) + interval '1 month')::date
      and (
        a.owner_id = auth.uid()
        or exists (select 1 from public.appointment_participants ap
                   where ap.appointment_id = a.id and ap.user_id = auth.uid())
        or (a.type = 'solo'
            and exists (select 1 from public.schedule_shares s
                        where s.owner_id = a.owner_id and s.viewer_id = auth.uid() and s.status = 'accepted'))
      )
  ) v;
$$;

grant execute on function public.create_appointment(text, date, text, text, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.delete_appointment(uuid) to authenticated;
grant execute on function public.respond_appointment(uuid, boolean) to authenticated;
grant execute on function public.appointments_for_month(int, int) to authenticated;
