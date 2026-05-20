'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar, toInitials } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon, ChevronLeftIcon, ImageIcon, UploadIcon } from '@/components/ui/icons'
import { getCurrentSession, updatePhoto, type Session } from '@/lib/auth'

const PRESETS = [
  '/avatars/avatar-1.svg',  '/avatars/avatar-2.svg',  '/avatars/avatar-3.svg',
  '/avatars/avatar-4.svg',  '/avatars/avatar-5.svg',  '/avatars/avatar-6.svg',
  '/avatars/avatar-7.svg',  '/avatars/avatar-8.svg',  '/avatars/avatar-9.svg',
  '/avatars/avatar-10.svg', '/avatars/avatar-11.svg', '/avatars/avatar-12.svg',
] as const

const NONE = 'none' as const
type Selection = string

async function imageFileToSquareDataURL(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image-load-failed'))
      el.src = url
    })
    const minSide = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - minSide) / 2
    const sy = (img.naturalHeight - minSide) / 2
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas-unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function PhotoEditPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [session, setSession] = useState<Session | null>(null)
  const [selected, setSelected] = useState<Selection>(NONE)
  const [originalPhoto, setOriginalPhoto] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await getCurrentSession()
      if (!alive) return
      if (!s) { router.replace('/login'); return }
      setSession(s)
      setOriginalPhoto(s.photo)
      setSelected(s.photo || NONE)
    })()
    return () => { alive = false }
  }, [router])

  if (!session) return <div className="min-h-[100dvh] bg-bg" />

  const previewPhoto = selected === NONE ? undefined : selected
  const dirty = (selected === NONE ? undefined : selected) !== originalPhoto

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await imageFileToSquareDataURL(file)
      setSelected(dataUrl)
    } catch {
      showToast('이미지를 읽지 못했어요.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    if (!dirty || busy) return
    setBusy(true)
    const next = selected === NONE ? null : selected
    const res = await updatePhoto(next)
    setBusy(false)
    if (!res.ok) {
      showToast(res.message ?? '사진 저장 중 문제가 생겼어요.', 'danger')
      return
    }
    showToast('프로필 사진을 저장했어요.', 'success')
    router.push('/settings/info')
  }

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />
      <header className="h-topbar flex items-center justify-between gap-1 px-1.5 border-b border-line bg-surface shrink-0">
        <div className="flex items-center gap-1">
          <Link
            href="/settings/info"
            aria-label="뒤로"
            className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
          >
            <ChevronLeftIcon size={20} />
          </Link>
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">프로필 사진</h3>
        </div>
        <Button
          variant={dirty ? 'primary' : 'outline'}
          size="sm"
          disabled={!dirty || busy}
          onClick={handleSave}
          className={dirty ? '' : 'opacity-50'}
        >
          {busy ? '저장 중…' : '저장'}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-8">
        {/* Hero preview */}
        <section className="flex flex-col items-center px-4 py-6 bg-surface border border-line rounded-xl">
          <div
            className="rounded-full p-1"
            style={{
              background:
                'conic-gradient(from 130deg, var(--brand) 0%, var(--brand-500) 35%, var(--brand-300) 65%, var(--brand) 100%)',
            }}
          >
            <div className="rounded-full p-[3px] bg-surface">
              <Avatar
                name={session.name}
                photo={previewPhoto}
                size="xl"
                color="brand"
                className="!w-[148px] !h-[148px] !text-[48px]"
              />
            </div>
          </div>
          <p className="mt-3.5 text-callout text-ink-700 leading-relaxed text-center">
            <strong className="text-ink-900">{session.name}</strong> 님의 프로필 사진은
            <br />동료가 비교 추가할 때 검색 결과에 표시돼요.
          </p>
        </section>

        {/* Source pickers */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="h-14 flex items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-brand-100 bg-brand-050 text-brand text-callout font-semibold"
          >
            <ImageIcon size={20} />
            카메라 / 앨범
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="h-14 flex items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-line bg-surface text-ink-900 text-callout font-semibold"
          >
            <UploadIcon size={20} />
            파일 올리기
          </button>
        </div>

        {/* Preset grid */}
        <div className="mt-5">
          <div className="px-1 pb-2 flex items-baseline justify-between">
            <span className="text-[11px] font-bold tracking-wider uppercase text-ink-500">
              기본 이미지에서 고르기
            </span>
            <span className="font-en text-[11px] text-ink-300">{PRESETS.length}가지</span>
          </div>
          <div className="bg-surface border border-line rounded-xl p-3.5 grid grid-cols-5 gap-3">
            <PresetButton
              selected={selected === NONE}
              onSelect={() => setSelected(NONE)}
            >
              <div className="w-12 h-12 rounded-full bg-bg text-ink-500 grid place-items-center text-[11px] font-bold tracking-tight border-[1.5px] border-line-2 border-dashed">
                {toInitials(session.name)}
              </div>
            </PresetButton>
            {PRESETS.map(src => (
              <PresetButton
                key={src}
                selected={selected === src}
                onSelect={() => setSelected(src)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-12 h-12 rounded-full block bg-bg" />
              </PresetButton>
            ))}
          </div>
          <p className="px-2 pt-2 text-[11px] text-ink-500 leading-relaxed">
            첫 번째 항목을 고르면 사진 없이 이름의 첫 두 글자로 표시돼요.
          </p>
        </div>
      </div>
    </div>
  )
}

function PresetButton({
  selected, onSelect, children,
}: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onSelect} className="relative grid place-items-center bg-transparent">
      <div
        className={`p-[3px] rounded-full transition-colors duration-150 ${
          selected ? 'bg-brand' : 'bg-transparent'
        }`}
      >
        {children}
      </div>
      {selected && (
        <span className="absolute -right-0.5 -top-0.5 w-[18px] h-[18px] rounded-full bg-brand text-ink-on-brand grid place-items-center border-2 border-surface">
          <CheckIcon size={10} />
        </span>
      )}
    </button>
  )
}
