'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'

const GA_ID = 'G-N9EBNCQPP0'

// Google Analytics (gtag.js) with a per-browser opt-out.
// Visit the site once with `?noga=1` to stop GA from ever counting this
// browser again (persists in localStorage, survives IP/network changes);
// `?noga=0` clears it. When opted out we render nothing — gtag.js never
// loads, so `window.gtag` stays undefined and downstream events (e.g.
// pwa_install in lib/pwa-install.ts) become no-ops too.
export function Analytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    try {
      const noga = new URLSearchParams(window.location.search).get('noga')
      if (noga === '1') localStorage.setItem('ga_optout', '1')
      else if (noga === '0') localStorage.removeItem('ga_optout')
      setEnabled(localStorage.getItem('ga_optout') !== '1')
    } catch {
      setEnabled(true) // localStorage blocked (private mode etc.) — track as usual
    }
  }, [])

  if (!enabled) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          // Distinguish installed-PWA (home-screen, standalone) from in-browser
          // visits. Sent on config so it rides along with every event; register
          // 'display_mode' as a custom dimension in GA4 to segment by it.
          var dm = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone === true ? 'standalone' : 'browser';
          gtag('config', '${GA_ID}', { display_mode: dm });
          // Cold start from the home-screen icon = an app launch.
          if (dm === 'standalone') gtag('event', 'pwa_launch');
        `}
      </Script>
    </>
  )
}
