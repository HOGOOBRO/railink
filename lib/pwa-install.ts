// Captures the PWA install prompt at module load (outside React) so we never
// miss Chrome's beforeinstallprompt, which can fire before a component mounts.
// Imported for its side effect from SwRegister (which lives in the root layout).

import { track } from '@/lib/analytics'

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  prompt: () => Promise<void>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    window.dispatchEvent(new Event('railink:installable'))
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    track('pwa_install')
    try { localStorage.setItem('railink_installed', '1') } catch { /* ignore */ }
    window.dispatchEvent(new Event('railink:installed'))
  })
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt
}

export function clearDeferredPrompt(): void {
  deferredPrompt = null
}
