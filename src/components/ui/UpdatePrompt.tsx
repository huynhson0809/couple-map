import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

export function UpdatePrompt() {
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

  useEffect(() => {
    if (needRefresh) setShow(true)
  }, [needRefresh])

  if (!show) return null

  return (
    <div className="update-prompt">
      <RefreshCw size={16} />
      <span>New version available</span>
      <button
        type="button"
        onClick={() => {
          updateServiceWorker(true)
        }}
      >
        Update
      </button>
      <button
        type="button"
        className="dismiss"
        onClick={() => {
          setShow(false)
          setNeedRefresh(false)
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
