import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../hooks/I18nContext'
import { Button } from '../ui/Button'
import { Logo } from '../ui/Logo'
import { LangSwitch } from '../ui/LangSwitch'

export function RegisterPage() {
  const { signUp } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await signUp(email, password, displayName || undefined)
    setLoading(false)
    if (error) setError(error.message)
    else navigate('/')
  }

  return (
    <div className="auth-page">
      <div className="auth-topbar">
        <LangSwitch />
      </div>
      <div className="auth-brand">
        <Logo size={72} />
        <h1>{t('auth.createAccount')}</h1>
      </div>
      <p className="muted">{t('auth.startMapping')}</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="text"
          placeholder={t('auth.name')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          type="email"
          placeholder={t('auth.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <input
          type="password"
          placeholder={t('auth.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
        {error && <p className="error">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? t('auth.creating') : t('auth.signup')}
        </Button>
      </form>
      <p className="muted">
        {t('auth.haveAccount')} <Link to="/login">{t('auth.signin')}</Link>
      </p>
    </div>
  )
}
