'use client'

import { useEffect } from 'react'
import '@/lib/pwa-install' // side effect: capture beforeinstallprompt at app load
import { recordPwaLaunchIfInstalled } from '@/lib/pwa-launch'

// Registers the minimal service worker (enables the PWA install prompt).
// Renders nothing; lives in the root layout so it runs once on the client.
export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    // 설치형(standalone) 실행이면 본인 계정에 설치 신호를 기록 (PWA 설치 유저 수
    // 정확 집계용). best-effort — 실패해도 무시.
    void recordPwaLaunchIfInstalled()
  }, [])
  return null
}
