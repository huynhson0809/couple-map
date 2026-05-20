import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../hooks/I18nContext'
import { Button } from '../ui/Button'
import { Logo } from '../ui/Logo'
import { LangSwitch } from '../ui/LangSwitch'

export function LoginPage() {
  const { signIn } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await signIn(email, password)
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
        <h1>Mapmate</h1>
      </div>
      <p className="muted">{t('auth.welcome')}</p>
      <form onSubmit={handleSubmit} className="auth-form">
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
          autoComplete="current-password"
        />
        {error && <p className="error">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? t('auth.signingIn') : t('auth.signin')}
        </Button>
      </form>
      <p className="muted">
        {t('auth.noAccount')} <Link to="/register">{t('auth.signup')}</Link>
      </p>
    </div>
  )
}
