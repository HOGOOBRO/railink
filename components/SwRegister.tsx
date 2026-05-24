'use client'

import { useEffect } from 'react'
import '@/lib/pwa-install' // side effect: capture beforeinstallprompt at app load

// Registers the minimal service worker (enables the PWA install prompt).
// Renders nothing; lives in the root layout so it runs once on the client.
export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
