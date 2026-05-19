import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useCoupleCtx } from '../../hooks/CoupleContext'
import { useI18n } from '../../hooks/I18nContext'
import { Logo } from '../ui/Logo'
import { LangSwitch } from '../ui/LangSwitch'

export function CoupleSetup() {
  const { signOut } = useAuth()
  const { couple, createCouple, joinCouple } = useCoupleCtx()
  const { t } = useI18n()
  const navigate = useNavigate()

  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (couple && couple.user_b) {
      navigate('/', { replace: true })
    }
  }, [couple, navigate])

  async function handleCreate() {
    setBusy('create')
    setError(null)
    try {
      await createCouple()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setBusy('join')
    setError(null)
    try {
      await joinCouple(inviteCode)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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

      {couple ? (
        <div className="stack">
          <p>{t('pair.share')}</p>
          <button
            type="button"
            onClick={copyCode}
            className="invite-code"
            style={{ cursor: 'pointer', font: 'inherit', fontSize: 32, letterSpacing: 6, fontWeight: 700 }}
            aria-label="Copy invite code"
          >
            {couple.invite_code}
          </button>
          <p className="muted small">{copied ? t('pair.copied') : t('pair.tapCopy')}</p>
        </div>
      ) : (
        <div className="stack">
          <Button onClick={handleCreate} disabled={busy !== null}>
            {busy === 'create' ? t('pair.creating') : t('pair.create')}
          </Button>
        </div>
      )}

      <div className="divider">
        <span>{couple ? t('pair.orJoin') : t('pair.or')}</span>
      </div>

      <form onSubmit={handleJoin} className="auth-form">
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          placeholder={t('pair.code')}
          maxLength={12}
          autoComplete="off"
          required
        />
        <Button type="submit" disabled={busy !== null || !inviteCode.trim()}>
          {busy === 'join' ? t('pair.joining') : t('pair.join')}
        </Button>
      </form>

      {error && <p className="error">{error}</p>}

      <button className="link-btn" onClick={() => signOut()}>
        {t('auth.signout')}
      </button>
    </div>
  )
}
