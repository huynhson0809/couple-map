import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useCoupleCtx } from '../../hooks/CoupleContext'
import { useI18n } from '../../hooks/I18nContext'
import { Logo } from '../ui/Logo'
import { LangSwitch } from '../ui/LangSwitch'
import {
  type CoupleLifecycleNotice,
  fetchUnreadCoupleLifecycleNotice,
  markCoupleLifecycleNoticeRead,
} from '../../lib/coupleLifecycleNotices'

export function CoupleSetup() {
  const { user, signOut } = useAuth()
  const { couple, createCouple, joinCouple } = useCoupleCtx()
  const { t } = useI18n()
  const navigate = useNavigate()

  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [copied, setCopied] = useState(false)
  const [acceptedCoupleLock, setAcceptedCoupleLock] = useState(false)
  const [lifecycleNotice, setLifecycleNotice] = useState<CoupleLifecycleNotice | null>(null)

  useEffect(() => {
    if (couple && couple.user_b) {
      navigate('/', { replace: true })
    }
  }, [couple, navigate])

  useEffect(() => {
    let cancelled = false
    if (!user?.id || couple) {
      return
    }

    fetchUnreadCoupleLifecycleNotice(user.id)
      .then((notice) => {
        if (cancelled || !notice) return
        setLifecycleNotice({
          ...notice,
          message: notice.message || t('pair.coupleEndedNotice'),
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [couple, t, user?.id])

  function pairErrorMessage(err: unknown) {
    if (err instanceof Error) return err.message
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message)
    }
    return String(err)
  }

  function formatPairError(err: unknown) {
    const message = pairErrorMessage(err)
    if (/ONE_COUPLE_ACCOUNT_LOCKED/i.test(message) || /already in another couple/i.test(message)) {
      return t('pair.lockedError')
    }
    return message
  }

  async function dismissLifecycleNotice() {
    const notice = lifecycleNotice
    if (!notice) return
    setLifecycleNotice(null)
    try {
      await markCoupleLifecycleNoticeRead(notice.id)
    } catch {
      setLifecycleNotice(notice)
    }
  }

  async function handleCreate() {
    if (!acceptedCoupleLock) {
      setError(t('pair.lockRequired'))
      return
    }

    setBusy('create')
    setError(null)
    try {
      await createCouple()
    } catch (e) {
      setError(formatPairError(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    if (!acceptedCoupleLock) {
      setError(t('pair.lockRequired'))
      return
    }

    setBusy('join')
    setError(null)
    try {
      await joinCouple(inviteCode)
      navigate('/', { replace: true })
    } catch (e) {
      setError(formatPairError(e))
    } finally {
      setBusy(null)
    }
  }

  async function copyCode() {
    if (!couple) return
    try {
      await navigator.clipboard.writeText(couple.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-topbar">
        <LangSwitch />
      </div>
      <div className="auth-brand">
        <Logo size={56} />
        <h1>{t('pair.title')}</h1>
      </div>

      {!couple && lifecycleNotice && (
        <div className="pair-lifecycle-notice" role="status">
          <span>{lifecycleNotice.message}</span>
          <button type="button" onClick={() => void dismissLifecycleNotice()}>
            {t('pair.noticeDismiss')}
          </button>
        </div>
      )}

      {couple ? (
        <div className="stack">
          <p>{t('pair.lockedWaiting')}</p>
          <button
            type="button"
            onClick={copyCode}
            className="invite-code"
            style={{ cursor: 'pointer', font: 'inherit', fontSize: 32, letterSpacing: 6, fontWeight: 700 }}
            aria-label={t('pair.copyInviteCode')}
          >
            {couple.invite_code}
          </button>
          <p className="muted small">{copied ? t('pair.copied') : t('pair.tapCopy')}</p>
        </div>
      ) : (
        <>
          <div className="pair-lock-notice">
            <p>{t('pair.oneCoupleWarning')}</p>
            <label className="pair-lock-check">
              <input
                type="checkbox"
                checked={acceptedCoupleLock}
                onChange={(e) => {
                  setAcceptedCoupleLock(e.target.checked)
                  if (e.target.checked) setError(null)
                }}
              />
              <span>{t('pair.oneCoupleConfirm')}</span>
            </label>
          </div>

          <div className="stack">
            <Button onClick={handleCreate} disabled={busy !== null || !acceptedCoupleLock}>
              {busy === 'create' ? t('pair.creating') : t('pair.create')}
            </Button>
          </div>

          <div className="divider">
            <span>{t('pair.or')}</span>
          </div>

          <form onSubmit={handleJoin} className="auth-form">
            <input
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value.toUpperCase())
                if (error) setError(null)
              }}
              placeholder={t('pair.code')}
              maxLength={12}
              autoComplete="off"
              required
            />
            <Button type="submit" disabled={busy !== null || !acceptedCoupleLock || !inviteCode.trim()}>
              {busy === 'join' ? t('pair.joining') : t('pair.join')}
            </Button>
          </form>
        </>
      )}

      {error && <p className="error">{error}</p>}

      <button className="link-btn" onClick={() => signOut()}>
        {t('auth.signout')}
      </button>
    </div>
  )
}
