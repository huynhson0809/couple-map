import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { useI18n } from '../../hooks/I18nContext'

export function UpdatePrompt() {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Poll every 60s for new SW
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {})
        }, 60_000)
      }
    },
  })

  if (!show && !needRefresh) return null

  return (
    <div className="update-prompt lg-update-prompt phase7-system-prompt" role="status">
      <RefreshCw size={16} />
      <span>{t('app.updateAvailable')}</span>
      <Button
        size="sm"
        onClick={() => {
          updateServiceWorker(true)
        }}
      >
        {t('app.updateAction')}
      </Button>
      <IconButton
        label={t('common.dismiss')}
        size="sm"
        variant="ghost"
        className="dismiss"
        onClick={() => {
          setShow(false)
          setNeedRefresh(false)
        }}
      >
        ×
      </IconButton>
    </div>
  )
}
