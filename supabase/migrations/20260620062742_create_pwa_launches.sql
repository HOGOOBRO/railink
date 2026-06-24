-- PWA 설치 유저 추적 테이블 + 기록 RPC.
--
-- 드리프트 복원: 이 마이그레이션은 2026-06-20 MCP(apply_migration)로 prod에
-- 적용됐으나 git에는 누락돼 있었다(원장 version 20260620062742). prod 원장에
-- 저장된 원본 SQL을 그대로 옮겨 git ↔ prod를 맞춘다. 내용은 prod와 동일하며,
-- 이미 적용된 환경에는 원장 가드로 재실행되지 않는다. (참고: [[railink-migration-drift]])
--
-- 설계: 설치형(standalone) 실행을 본인 계정에 1행으로 누적한다. 계정 기준이라
-- "몇 명이 설치했나"가 디바이스/쿠키 중복 없이 정확하다(GA4 한계 보완).
--   first_launch_at  처음 standalone 실행 시각
--   last_launch_at   마지막 standalone 실행 시각 (활성 판단)
--   launch_count     standalone 실행 누적 횟수
--   platform         기기 종류(ios|android|other 등). 선택.
-- 클라이언트: lib/pwa-launch.ts 가 부팅 시 standalone+로그인이면 record_pwa_launch() 호출.

CREATE TABLE public.pwa_launches (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_launch_at timestamptz NOT NULL DEFAULT now(),
  last_launch_at timestamptz NOT NULL DEFAULT now(),
  launch_count integer NOT NULL DEFAULT 1,
  platform text
);

ALTER TABLE public.pwa_launches ENABLE ROW LEVEL SECURITY;

-- 본인 행만 insert/update 가능
CREATE POLICY "users insert own pwa launch"
  ON public.pwa_launches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own pwa launch"
  ON public.pwa_launches FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users read own pwa launch"
  ON public.pwa_launches FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 론치 기록용 RPC: upsert + 카운트 증가를 한 번에 처리
CREATE OR REPLACE FUNCTION public.record_pwa_launch(p_platform text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pwa_launches (user_id, platform)
  VALUES (auth.uid(), p_platform)
  ON CONFLICT (user_id) DO UPDATE
    SET last_launch_at = now(),
        launch_count = public.pwa_launches.launch_count + 1,
        platform = COALESCE(EXCLUDED.platform, public.pwa_launches.platform);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_pwa_launch(text) TO authenticated;

-- 집계 SQL:
--   select count(*) as installed_users,
--          count(*) filter (where last_launch_at > now() - interval '7 days') as active_7d
--   from public.pwa_launches;
