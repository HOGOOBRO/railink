-- 항공 크루(아시아나 등) 하루 다중 레그 저장용 flights(jsonb) 컬럼 추가.
-- 노선이 캡쳐에 명시된 항공사는 편명→노선 룩업표 대신 SECTOR/STD/STA를 그대로 저장한다.
-- 형태: [{ "flight":"349", "from":"ICN", "to":"NKG", "std":"12:30", "sta":"13:40" }, ...]
-- 기존 KTX/에어프레미아 행은 flights = null (영향 없음).

alter table public.schedules
  add column if not exists flights jsonb;

-- replace_schedule_months: 월 단위 일괄 교체 RPC에 flights를 추가.
-- (jsonb_to_recordset 정의 3곳 + insert에 flights jsonb 반영)
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
      is_off boolean,
      flights jsonb
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
      is_off boolean,
      flights jsonb
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
    is_off,
    flights
  )
  select
    e.user_id,
    e.work_date,
    nullif(e.dia_nr, ''),
    nullif(e.train_nr, ''),
    nullif(e.start_time, ''),
    nullif(e.end_time, ''),
    coalesce(e.is_off, false),
    e.flights
  from jsonb_to_recordset(entries) as e(
    user_id uuid,
    work_date date,
    dia_nr text,
    train_nr text,
    start_time text,
    end_time text,
    is_off boolean,
    flights jsonb
  );

  get diagnostics saved_count = row_count;
  return saved_count;
end;
$$;

revoke all on function public.replace_schedule_months(jsonb) from public;
grant execute on function public.replace_schedule_months(jsonb) to authenticated;
