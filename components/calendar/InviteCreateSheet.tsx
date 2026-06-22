'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { UserIcon, CheckIcon, InfoIcon, ShareIosIcon, CloseIcon } from '@/components/ui/icons'
import { createInvite, buildInviteMessage, DEMO_INVITE_TOKEN } from '@/lib/store/invites'
import { track } from '@/lib/analytics'
import type { Group } from '@/lib/types/schedule'

type ToastType = 'default' | 'success' | 'danger'

interface InviteCreateSheetProps {
  groups: Group[]
  activeGroupId: string | null
  onClose: () => void
  showToast: (message: string, type?: ToastType) => void
  /** Inviter's display name — leads the shared message ("○○님이…"). */
  inviterName?: string | null
  /** Pre-fill the email-match field — set when opened from a failed email search
   *  so the invite is scoped to that exact address with no extra typing. */
  initialEmail?: string | null
}

/* 친구 초대 — pick a target group + optional email match → create_invite → a
 * shareable link. Same UI for KTX and personal (invite issuing is equal). The
 * link auto-connects the inviter on signup (consume_invite, track-agnostic). */
export function InviteCreateSheet({
  groups, activeGroupId, onClose, showToast, inviterName, initialEmail,
}: InviteCreateSheetProps) {
  const t = useTranslations('calendarUi.inviteCreate')
  const [stage, setStage] = useState<'setup' | 'created'>('setup')
  const [groupId, setGroupId] = useState<string | null>(activeGroupId ?? groups[0]?.id ?? null)
  const [matchEmail, setMatchEmail] = useState(!!initialEmail?.trim())
  const [email, setEmail] = useState(initialEmail?.trim() ?? '')
  const [loading, setLoading] = useState(false)
  const [link, setLink] = useState('')

  const selectedGroupName =
    groups.find(g => g.id === groupId)?.name ?? t('defaultGroup')

  async function handleCreate() {
    if (matchEmail && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showToast(t('toastEmailInvalid'), 'danger')
      return
    }
    setLoading(true)
    const res = await createInvite(groupId, matchEmail ? email.trim() : null)
    setLoading(false)
    if (!res.ok) { showToast(res.message, 'danger'); return }
    track('invite_create', { demo: res.token === DEMO_INVITE_TOKEN ? 'yes' : 'no' })
    // utm 태그로 GA에서 초대 유입을 구분. signup은 invite 파라미터만 읽고,
    // app/page.tsx가 쿼리를 통째로 전달하므로 추가 파라미터는 무해하다.
    const url = `${window.location.origin}/signup?invite=${res.token}&utm_source=invite&utm_medium=app`
    setLink(url)
    setStage('created')
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buildInviteMessage(inviterName, link))
      showToast(t('toastCopied'), 'success')
    } catch {
      showToast(t('toastCopyFailed'), 'danger')
    }
  }

  async function shareLink() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        // Pass both: `text` carries the full 문구+링크 for chat apps that paste
        // the message, `url` lets targets like KakaoTalk render the OG card.
        await navigator.share({ title: t('shareTitle'), text: buildInviteMessage(inviterName, link), url: link })
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
          <p className="text-subtitle font-bold tracking-tight text-ink-900">{t('title')}</p>
          <p className="text-caption text-ink-500">{t('subtitle')}</p>
        </div>
        <button onClick={onClose} aria-label={t('close')} className="w-9 h-9 grid place-items-center text-ink-500 rounded-full hover:bg-bg">
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="px-5">
        {stage === 'setup' ? (
          <>
            <p className="text-caption font-semibold text-ink-900 mb-2">{t('groupPrompt')}</p>
            {groups.length === 0 ? (
              <p className="text-caption text-ink-500 mb-4">{t('noGroupsHint')}</p>
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
                <p className="text-callout font-semibold text-ink-900">{t('emailMatchTitle')}</p>
                <p className="text-caption text-ink-500 mt-0.5 leading-relaxed">
                  {t('emailMatchDesc')}
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
                placeholder={t('emailPlaceholder')}
                className="mt-2.5 w-full px-3.5 h-12 rounded-sm border-2 border-line bg-surface font-en text-body outline-none focus:border-brand"
              />
            )}

            <button
              onClick={handleCreate}
              disabled={loading}
              className="mt-5 w-full h-btn rounded-sm bg-brand text-ink-on-brand font-semibold text-callout disabled:opacity-60"
            >
              {loading ? t('creating') : t('createLink')}
            </button>
          </>
        ) : (
          <>
            <div
              className="flex items-center gap-2 px-3.5 py-3 rounded-md text-caption mb-3.5"
              style={{ background: 'color-mix(in oklab, var(--success) 12%, white)' }}
            >
              <span className="text-success shrink-0"><CheckIcon size={16} /></span>
              <span className="text-ink-900">
                {t.rich('createdNotice', {
                  group: selectedGroupName,
                  b: (chunks) => <strong>{chunks}</strong>,
                })}
              </span>
            </div>

            <div className="flex items-center gap-2 px-3.5 py-3 rounded-md border border-line-2 bg-bg mb-2">
              <span className="flex-1 min-w-0 truncate font-en text-caption text-ink-900">{link}</span>
              <button
                onClick={copyLink}
                className="shrink-0 px-3 py-1.5 rounded-pill bg-brand-050 text-brand text-caption font-bold"
              >
                {t('copy')}
              </button>
            </div>
            <p className="flex items-center gap-1.5 text-caption text-ink-500 mb-5">
              <span className="text-warn shrink-0"><InfoIcon size={14} /></span>
              {t.rich('linkLimit', { b: (chunks) => <strong className="text-ink-700">{chunks}</strong> })}
            </p>

            <button
              onClick={shareLink}
              className="w-full h-btn rounded-sm bg-brand text-ink-on-brand font-semibold text-callout inline-flex items-center justify-center gap-2"
            >
              <ShareIosIcon size={16} /> {t('share')}
            </button>
            <button
              onClick={() => { setStage('setup'); setLink('') }}
              className="mt-3 w-full text-caption text-ink-500 py-1.5"
            >
              {t('newLinkOtherGroup')}
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
