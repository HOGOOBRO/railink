create table if not exists public.schedules (
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  dia_nr text,
  train_nr text,
  start_time text,
  end_time text,
  is_off boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, work_date)
);

create index if not exists schedules_work_date_idx
on public.schedules (work_date);

alter table public.schedules enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists schedules_set_updated_at on public.schedules;
create trigger schedules_set_updated_at
before update on public.schedules
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.schedules to authenticated;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists schedules_select_shared_or_own on public.schedules;
create policy schedules_select_shared_or_own
on public.schedules
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.profiles p
    where p.id = schedules.user_id
      and p.share_schedule = true
  )
);

drop policy if exists schedules_insert_own on public.schedules;
create policy schedules_insert_own
on public.schedules
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists schedules_update_own on public.schedules;
create policy schedules_update_own
on public.schedules
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists schedules_delete_own on public.schedules;
create policy schedules_delete_own
on public.schedules
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.replace_schedule_months(entries jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  saved_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if jsonb_typeof(entries) is distinct from 'array' then
    raise exception 'schedule entries must be an array';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(entries) as e(
      user_id uuid,
      work_date date,
      dia_nr text,
      train_nr text,
      start_time text,
      end_time text,
      is_off boolean
    )
    where e.user_id is distinct from auth.uid()
  ) then
    raise exception 'cannot replace another user schedule';
  end if;

  delete from public.schedules s
  using (
    select distinct
      e.user_id,
      date_trunc('month', e.work_date)::date as month_start
    from jsonb_to_recordset(entries) as e(
      user_id uuid,
      work_date date,
      dia_nr text,
      train_nr text,
      start_time text,
      end_time text,
      is_off boolean
    )
  ) months
  where s.user_id = months.user_id
    and s.work_date >= months.month_start
    and s.work_date < (months.month_start + interval '1 month');

  insert into public.schedules (
    user_id,
    work_date,
    dia_nr,
    train_nr,
    start_time,
    end_time,
    is_off
  )
  select
    e.user_id,
    e.work_date,
    nullif(e.dia_nr, ''),
    nullif(e.train_nr, ''),
    nullif(e.start_time, ''),
    nullif(e.end_time, ''),
    coalesce(e.is_off, false)
  from jsonb_to_recordset(entries) as e(
    user_id uuid,
    work_date date,
    dia_nr text,
    train_nr text,
    start_time text,
    end_time text,
    is_off boolean
  );

  get diagnostics saved_count = row_count;
  return saved_count;
end;
$$;

revoke all on function public.replace_schedule_months(jsonb) from public;
grant execute on function public.replace_schedule_months(jsonb) to authenticated;
