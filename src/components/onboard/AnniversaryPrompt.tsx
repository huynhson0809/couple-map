import { useState } from 'react'
import { Heart } from 'lucide-react'
import { Button } from '../ui/Button'
import { useCoupleCtx } from '../../hooks/CoupleContext'
import { useI18n } from '../../hooks/I18nContext'
import { useSpaceCtx } from '../../hooks/SpaceContext'

export function AnniversaryPrompt() {
  const { couple, updateCouple } = useCoupleCtx()
  const { capabilities } = useSpaceCtx()
  const { t } = useI18n()
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shouldShow =
    capabilities.canDeleteSpace &&
    capabilities.canUseDuoFeatures &&
    !!couple &&
    !couple.anniversary_date &&
    !skipped

  if (!shouldShow) return null

  async function handleSave() {
    if (!date) return
    setSaving(true)
    setError(null)
    try {
      await updateCouple({ anniversary_date: date })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="onboard-backdrop">
      <div className="onboard-card">
        <div className="onboard-icon">
          <Heart size={28} />
        </div>
        <h2>{t('onboard.anniversaryTitle')}</h2>
        <p className="muted">{t('onboard.anniversaryHint')}</p>
        <input
          type="date"
          value={date}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => setDate(e.target.value)}
          className="onboard-date"
        />
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ marginTop: 8 }}>
          <Button variant="secondary" onClick={() => setSkipped(true)} disabled={saving}>
            {t('onboard.skip')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !date} style={{ flex: 1 }}>
            {saving ? '…' : t('onboard.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
