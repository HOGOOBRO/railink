create table if not exists public.ai_image_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_month text not null,
  image_count integer not null default 1,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists ai_image_usage_user_month_idx
on public.ai_image_usage (user_id, usage_month, created_at);

alter table public.ai_image_usage enable row level security;

grant select, insert on public.ai_image_usage to authenticated;

drop policy if exists ai_image_usage_select_own on public.ai_image_usage;
create policy ai_image_usage_select_own
on public.ai_image_usage
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists ai_image_usage_insert_own on public.ai_image_usage;
create policy ai_image_usage_insert_own
on public.ai_image_usage
for insert
to authenticated
with check (auth.uid() = user_id);
