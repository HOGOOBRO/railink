'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import styles from './phone-mock.module.css'

/* 랜딩 폰 목업의 공용 셸 — 실제 아이폰 논리 해상도(390×844) 캔버스에 화면을
   그린 뒤, 목업 표시 폭에 맞춰 통째로 축소(transform: scale)한다. 베젤 두께·
   모서리 반경도 폭에 비례시켜 어떤 크기에서도 동일한 비율로 보인다. children은
   상태바 아래에 들어갈 화면 콘텐츠(앱 화면). 절대배치 오버레이(FAB 등)도 children
   으로 함께 넘기면 된다(셸의 layer가 position:relative). */

export const DESIGN_W = 390
export const DESIGN_H = 844

function StatusBar() {
  return (
    <div className={styles.status}>
      <span>9:41</span>
      <span className={styles.sig}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.5" y="5" width="3" height="6" rx="1" /><rect x="9" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.5" y="0" width="3" height="11" rx="1" /></svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><path d="M8 2.2c2.3 0 4.4.9 6 2.3l-1.3 1.4A6.6 6.6 0 0 0 8 4.1c-1.8 0-3.4.7-4.7 1.8L2 4.5A8.9 8.9 0 0 1 8 2.2Z" /><path d="M8 6c1.2 0 2.3.5 3.1 1.2L8 10.5 4.9 7.2A4.6 4.6 0 0 1 8 6Z" /></svg>
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none"><rect x="1" y="1" width="20" height="10" rx="3" stroke="currentColor" strokeOpacity=".4" /><rect x="3" y="3" width="15" height="6" rx="1.5" fill="currentColor" /><rect x="22" y="4" width="1.6" height="4" rx=".8" fill="currentColor" fillOpacity=".5" /></svg>
      </span>
    </div>
  )
}

export function PhoneShell({
  size,
  rotate,
  children,
}: {
  size?: string
  rotate?: number
  children: React.ReactNode
}) {
  const phoneRef = useRef<HTMLDivElement>(null)
  const [phoneW, setPhoneW] = useState(0)

  useEffect(() => {
    const el = phoneRef.current
    if (!el) return
    const measure = () => setPhoneW(el.offsetWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 기준 hero 348px: border 4 / phone radius 40 / screen radius 36 (비율 유지).
  const measured = phoneW > 0
  const border = measured ? (phoneW * 4) / 348 : 4
  const phoneRadius = measured ? (phoneW * 40) / 348 : 40
  const screenRadius = measured ? (phoneW * 36) / 348 : 36
  const scale = measured ? (phoneW - 2 * border) / DESIGN_W : 1

  const phoneStyle: CSSProperties = {
    borderWidth: `${border}px`,
    borderRadius: `${phoneRadius}px`,
  }
  if (size) phoneStyle.width = size
  if (rotate) phoneStyle.transform = `rotate(${rotate}deg)`

  return (
    <div className={styles.phone} ref={phoneRef} style={phoneStyle}>
      <div
        className={styles.screen}
        style={{ aspectRatio: `${DESIGN_W} / ${DESIGN_H}`, borderRadius: `${screenRadius}px` }}
      >
        <div
          className="relative flex flex-col origin-top-left"
          style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})` }}
        >
          <div className={styles.notch} />
          <StatusBar />
          {children}
        </div>
      </div>
    </div>
  )
}
