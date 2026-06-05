import { useI18n } from '../../hooks/I18nContext'
import { SegmentedControl } from './SegmentedControl'

export function LangSwitch() {
  const { lang, setLang } = useI18n()
  return (
    <SegmentedControl
      value={lang}
      label="Language"
      size="sm"
      className="lang-switch"
      options={[
        { value: 'en', label: 'EN' },
        { value: 'vi', label: 'VI' },
      ]}
      onChange={setLang}
    />
  )
}
