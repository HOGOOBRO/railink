'use client'

import { useState } from 'react'
import { UserIcon, CheckIcon, InfoIcon, ShareIosIcon, CloseIcon } from '@/components/ui/icons'
import { createInvite } from '@/lib/store/invites'
import type { Group } from '@/lib/types/schedule'

type ToastType = 'default' | 'success' | 'danger'

interface InviteCreateSheetProps {
  groups: Group[]
  activeGroupId: string | null
  onClose: () => void
  showToast: (message: string, type?: ToastType) => void
}

/* 친구 초대 — pick a target group + optional email match → create_invite → a
 * shareable link. Same UI for KTX and personal (invite issuing is equal). The
 * link auto-connects the inviter on signup (consume_invite, track-agnostic). */
export function InviteCreateSheet({ groups, activeGroupId, onClose, showToast }: InviteCreateSheetProps) {
  const [stage, setStage] = useState<'setup' | 'created'>('setup')
  const [groupId, setGroupId] = useState<string | null>(activeGroupId ?? groups[0]?.id ?? null)
  const [matchEmail, setMatchEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [link, setLink] = useState('')

  const selectedGroupName =
    groups.find(g => g.id === groupId)?.name ?? '기본'

  async function handleCreate() {
    if (matchEmail && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showToast('이메일 형식을 확인해 주세요.', 'danger')
      return
    }
    setLoading(true)
    const res = await createInvite(groupId, matchEmail ? email.trim() : null)
    setLoading(false)
    if (!res.ok) { showToast(res.message, 'danger'); return }
    const url = `${window.location.origin}/signup?invite=${res.token}`
    setLink(url)
    setStage('created')
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      showToast('초대 링크를 복사했어요.', 'success')
    } catch {
      showToast('복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.', 'danger')
    }
  }

  async function shareLink() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'RaiLink 초대', text: 'RaiLink에서 일정을 맞춰봐요', url: link })
      } catch { /* user cancelled — no toast */ }
    } else {
      copyLink()
    }
  }

  return (
    <div className="flex flex-col pb-7">
      {/* header */}
      <div className="flex items-center gap-2.5 px-5 pt-2 pb-3">
        <span className="w-10 h-10 rounded-lg bg-brand-050 text-brand grid place-items-center shrink-0">
          <UserIcon size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-subtitle font-bold tracking-tight text-ink-900">친구 초대</p>
          <p className="text-caption text-ink-500">링크를 받은 사람이 가입하면 서로 일정이 연결돼요</p>
        </div>
        <button onClick={onClose} aria-label="닫기" className="w-9 h-9 grid place-items-center text-ink-500 rounded-full hover:bg-bg">
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="px-5">
        {stage === 'setup' ? (
          <>
            <p className="text-caption font-semibold text-ink-900 mb-2">어느 비교 그룹에 추가할까요?</p>
            {groups.length === 0 ? (
              <p className="text-caption text-ink-500 mb-4">가입하면 ‘기본’ 그룹에 자동으로 연결돼요.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-4">
                {groups.map(g => {
                  const on = g.id === groupId
                  return (
                    <button
                      key={g.id}
                      onClick={() => setGroupId(g.id)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-pill text-caption transition-colors ${
                        on ? 'bg-brand-050 text-brand font-bold border border-brand'
                           : 'bg-surface text-ink-500 font-medium border border-line-2'
                      }`}
                    >
                      {on && <CheckIcon size={13} />}
                      {g.name}
                    </button>
                  )
                })}
              </div>
            )}

            <button
              onClick={() => setMatchEmail(v => !v)}
              className="w-full flex items-center gap-3 px-3.5 py-3.5 rounded-md border border-line bg-surface text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-callout font-semibold text-ink-900">이메일 확인 추가</p>
                <p className="text-caption text-ink-500 mt-0.5 leading-relaxed">
                  켜면 지정한 이메일로만 가입할 수 있어 더 안전해요.
                </p>
              </div>
              <ToggleDot on={matchEmail} />
            </button>
            {matchEmail && (
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                inputMode="email"
                placeholder="초대할 사람의 이메일"
                className="mt-2.5 w-full px-3.5 h-12 rounded-sm border-2 border-line bg-surface font-en text-body outline-none focus:border-brand"
              />
            )}

            <button
              onClick={handleCreate}
              disabled={loading}
              className="mt-5 w-full h-btn rounded-sm bg-brand text-ink-on-brand font-semibold text-callout disabled:opacity-60"
            >
              {loading ? '만드는 중…' : '초대 링크 만들기'}
            </button>
          </>
        ) : (
          <>
            <div
              className="flex items-center gap-2 px-3.5 py-3 rounded-md text-caption mb-3.5"
              style={{ background: 'color-mix(in oklab, var(--success) 12%, white)' }}
            >
              <span className="text-success shrink-0"><CheckIcon size={16} /></span>
              <span className="text-ink-900"><strong>{selectedGroupName}</strong> 그룹 초대 링크가 만들어졌어요.</span>
            </div>

            <div className="flex items-center gap-2 px-3.5 py-3 rounded-md border border-line-2 bg-bg mb-2">
              <span className="flex-1 min-w-0 truncate font-en text-caption text-ink-900">{link}</span>
              <button
                onClick={copyLink}
                className="shrink-0 px-3 py-1.5 rounded-pill bg-brand-050 text-brand text-caption font-bold"
              >
                복사
              </button>
            </div>
            <p className="flex items-center gap-1.5 text-caption text-ink-500 mb-5">
              <span className="text-warn shrink-0"><InfoIcon size={14} /></span>
              이 링크는 <strong className="text-ink-700">14일 동안, 한 번만</strong> 쓸 수 있어요.
            </p>

            <button
              onClick={shareLink}
              className="w-full h-btn rounded-sm bg-brand text-ink-on-brand font-semibold text-callout inline-flex items-center justify-center gap-2"
            >
              <ShareIosIcon size={16} /> 공유하기
            </button>
            <button
              onClick={() => { setStage('setup'); setLink('') }}
              className="mt-3 w-full text-caption text-ink-500 py-1.5"
            >
              ← 다른 그룹으로 새 링크 만들기
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ToggleDot({ on }: { on: boolean }) {
  return (
    <span
      className={`relative w-11 h-6 rounded-pill shrink-0 transition-colors ${on ? 'bg-brand' : 'bg-line-2'}`}
    >
      <span
        className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-[left] ${on ? 'left-[23px]' : 'left-[3px]'}`}
      />
    </span>
  )
}
