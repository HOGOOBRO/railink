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
