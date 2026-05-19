import { useI18n } from '../../hooks/I18nContext'

export function LangSwitch() {
  const { lang, setLang } = useI18n()
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      <button
        type="button"
        className={lang === 'en' ? 'active' : ''}
        onClick={() => setLang('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={lang === 'vi' ? 'active' : ''}
        onClick={() => setLang('vi')}
      >
        VI
      </button>
    </div>
  )
}
