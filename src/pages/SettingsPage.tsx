import { LogOut, Globe, Heart, Copy, Check, Sun, Moon } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCoupleCtx } from '../hooks/CoupleContext'
import { isDarkModeEnabled, useTheme } from '../hooks/ThemeContext'
import { useI18n } from '../hooks/I18nContext'
import { Button } from '../components/ui/Button'

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const { profile, partner, couple } = useCoupleCtx()
  const { theme, setTheme } = useTheme()
  const { lang, setLang, t } = useI18n()
  const [copied, setCopied] = useState(false)
  const showDarkToggle = isDarkModeEnabled()

  async function copyCode() {
    if (!couple) return
    await navigator.clipboard.writeText(couple.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="page page-settings">
      <header className="page-header">
        <h1>{t('settings.title')}</h1>
      </header>

      <section className="setting-section">
        <div className="setting-section-title">
          {showDarkToggle ? t('settings.appearance') : t('settings.language')}
        </div>

        {showDarkToggle && (
          <div className="setting-row">
            <span>{t('settings.theme')}</span>
            <div className="seg">
              <button
                className={`seg-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
              >
                <Sun size={14} /> {t('settings.themeLight')}
              </button>
              <button
                className={`seg-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                <Moon size={14} /> {t('settings.themeDark')}
              </button>
            </div>
          </div>
        )}

        <div className="setting-row">
          {showDarkToggle ? (
            <span>
              <Globe size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {t('settings.language')}
            </span>
          ) : (
            <span className="muted small">
              {lang === 'en' ? 'Choose language' : 'Chọn ngôn ngữ'}
            </span>
          )}
          <div className="seg">
            <button
              className={`seg-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => setLang('en')}
            >
              EN
            </button>
            <button
              className={`seg-btn ${lang === 'vi' ? 'active' : ''}`}
              onClick={() => setLang('vi')}
            >
              VI
            </button>
          </div>
        </div>
      </section>

      <section className="setting-section">
        <div className="setting-section-title">{t('settings.account')}</div>
        <div className="setting-row col">
          <div className="muted small">{t('settings.profile')}</div>
          <div>{profile?.display_name ?? user?.email}</div>
          <div className="muted small">{user?.email}</div>
        </div>
        {partner && (
          <div className="setting-row col">
            <div className="muted small"><Heart size={12} style={{ display: 'inline' }} /> Partner</div>
            <div>{partner.display_name ?? partner.email}</div>
          </div>
        )}
        {couple && (
          <div className="setting-row">
            <span>{t('settings.inviteCode')}</span>
            <button className="copy-chip" onClick={copyCode}>
              <code>{couple.invite_code}</code>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
      </section>

      <Button variant="danger" onClick={() => signOut()} style={{ width: '100%' }}>
        <LogOut size={16} /> {t('settings.signOut')}
      </Button>
    </div>
  )
}
