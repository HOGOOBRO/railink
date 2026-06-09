// Captures the PWA install prompt at module load (outside React) so we never
// miss Chrome's beforeinstallprompt, which can fire before a component mounts.
// Imported for its side effect from SwRegister (which lives in the root layout).

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
    // Fire GA4 install event via the gtag.js loaded in app/layout.tsx (raw call
    // to avoid coupling this load-time module to the analytics wrapper).
    const gtag = (window as unknown as { gtag?: (command: 'event', name: string) => void }).gtag
    gtag?.('event', 'pwa_install')
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
