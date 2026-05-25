import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { usePinsCtx } from '../../hooks/PinsContext'
import { useCoupleCtx } from '../../hooks/CoupleContext'
import { useNotifications } from '../../hooks/useNotifications'
import { useI18n } from '../../hooks/I18nContext'
import { getImageUrl, getVideoThumbnailUrl, isVideoUrl } from '../../lib/cloudinary'
import { useCategoriesCtx } from '../../hooks/CategoriesContext'

const TOAST_MS = 6000

export function NotificationToast() {
  const { latestPartnerPin, clearLatestPartnerPin } = usePinsCtx()
  const { partner } = useCoupleCtx()
  const { notify } = useNotifications()
  const { t } = useI18n()
  const { getCategory } = useCategoriesCtx()
  const navigate = useNavigate()
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!latestPartnerPin) return
    const pin = latestPartnerPin
    const who = partner?.display_name ?? t('common.partner')

    // Fire OS notification (only when document hidden)
    notify(`${who} ${t('notif.newMemory')}`, {
      body: pin.title,
      tag: `pin-${pin.id}`,
      data: { url: `/?pin=${pin.id}` },
      onClick: () => {
        navigate('/', { state: { flyTo: { lat: pin.lat, lng: pin.lng, pinId: pin.id } } })
        clearLatestPartnerPin()
      },
    })

    // Auto-dismiss toast
    timerRef.current = window.setTimeout(() => {
      clearLatestPartnerPin()
    }, TOAST_MS)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [latestPartnerPin, partner, t, notify, navigate, clearLatestPartnerPin])

  if (!latestPartnerPin) return null
  const pin = latestPartnerPin
  const cat = getCategory(pin.category)
  const cover = pin.images?.[0]?.cloudinary_url
  const coverThumb = cover
    ? isVideoUrl(cover)
      ? getVideoThumbnailUrl(cover, 120, 70)
      : getImageUrl(cover, 120, 70)
    : null
  const who = partner?.display_name ?? t('common.partner')

  function viewOnMap() {
    navigate('/', { state: { flyTo: { lat: pin.lat, lng: pin.lng, pinId: pin.id } } })
    clearLatestPartnerPin()
  }

  return (
    <button
      type="button"
      className="notif-toast"
      onClick={viewOnMap}
      aria-label={t('notif.viewOnMap')}
    >
      {coverThumb ? (
        <img src={coverThumb} alt="" className="notif-cover" />
      ) : (
        <div className="notif-cover empty">
          <span>{pin.marker_emoji ?? cat?.emoji ?? '📍'}</span>
        </div>
      )}
      <div className="notif-body">
        <div className="notif-from">
          <Sparkles size={12} /> {who} {t('notif.newMemory')}
        </div>
        <div className="notif-title">{pin.title}</div>
      </div>
      <button
        type="button"
        className="notif-close"
        onClick={(e) => {
          e.stopPropagation()
          clearLatestPartnerPin()
        }}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </button>
  )
}
