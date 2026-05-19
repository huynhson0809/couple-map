import { useRef, useState } from 'react'
import { ImageUp, Eraser } from 'lucide-react'
import { Button } from '../ui/Button'
import { usePinsCtx } from '../../hooks/PinsContext'
import { CATEGORIES, getCategory } from '../../lib/categories'
import { useI18n } from '../../hooks/I18nContext'
import { compressImage } from '../../lib/imageCompress'
import { uploadToCloudinary, getImageUrl } from '../../lib/cloudinary'
import type { Pin } from '../../types'

interface Props {
  pin: Pin
  onSaved: () => void
  onCancel: () => void
}

const CUSTOM_EMOJIS = ['❤️', '🌸', '⭐', '🎈', '🍕', '🐱', '🐶', '🌈', '🎵', '⚽', '📸', '✨', '🏠', '🎂', '🍷']

export function EditPinForm({ pin, onSaved, onCancel }: Props) {
  const { updatePin } = usePinsCtx()
  const { t } = useI18n()
  const [title, setTitle] = useState(pin.title)
  const [note, setNote] = useState(pin.note ?? '')
  const [category, setCategory] = useState<string | null>(pin.category)
  const [markerEmoji, setMarkerEmoji] = useState<string | null>(pin.marker_emoji)
  const [markerImageUrl, setMarkerImageUrl] = useState<string | null>(pin.marker_image_url)
  const [markerUploading, setMarkerUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const markerInput = useRef<HTMLInputElement | null>(null)

  async function handleMarkerUpload(file: File | undefined) {
    if (!file) return
    setMarkerUploading(true)
    try {
      const compressed = await compressImage(file)
      const res = await uploadToCloudinary(compressed)
      setMarkerImageUrl(res.url)
      setMarkerEmoji(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setMarkerUploading(false)
    }
  }

  function previewIcon() {
    if (markerImageUrl) {
      return <img src={getImageUrl(markerImageUrl, 80)} alt="" className="marker-preview-img" />
    }
    if (markerEmoji) return <span className="marker-preview-emoji">{markerEmoji}</span>
    const cat = getCategory(category)
    if (cat) return <span className="marker-preview-emoji">{cat.emoji}</span>
    return <span className="marker-preview-emoji">📍</span>
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError(t('pin.required'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updatePin(pin.id, {
        title: title.trim(),
        note: note.trim() || null,
        category: category,
        marker_emoji: markerEmoji,
        marker_image_url: markerImageUrl,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="pin-form">
      <input
        type="text"
        placeholder={t('pin.title')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        required
      />

      <div>
        <div className="field-label">{t('pin.category')}</div>
        <div className="category-grid">
          {CATEGORIES.map((c) => {
            const active = category === c.id
            return (
              <button
                key={c.id}
                type="button"
                className={`category-chip ${active ? 'active' : ''}`}
                style={active ? { background: c.color, borderColor: c.color, color: 'white' } : undefined}
                onClick={() => setCategory(active ? null : c.id)}
              >
                <span className="emoji">{c.emoji}</span>
                <span>{c.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="field-label">{t('pin.marker')}</div>
        <div className="marker-picker">
          <div className="marker-preview">{previewIcon()}</div>
          <div className="marker-picker-options">
            <div className="marker-emoji-row">
              {CUSTOM_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`marker-emoji-btn ${markerEmoji === e ? 'active' : ''}`}
                  onClick={() => {
                    setMarkerEmoji(e === markerEmoji ? null : e)
                    if (e !== markerEmoji) setMarkerImageUrl(null)
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="row">
              <button
                type="button"
                className="photo-btn small"
                onClick={() => markerInput.current?.click()}
                disabled={markerUploading}
              >
                <ImageUp size={16} /> {markerUploading ? '…' : t('pin.markerUpload')}
              </button>
              {(markerEmoji || markerImageUrl) && (
                <button
                  type="button"
                  className="photo-btn small"
                  onClick={() => {
                    setMarkerEmoji(null)
                    setMarkerImageUrl(null)
                  }}
                >
                  <Eraser size={16} /> {t('pin.markerClear')}
                </button>
              )}
            </div>
            <input
              ref={markerInput}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                handleMarkerUpload(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
        </div>
      </div>

      <textarea
        placeholder={t('pin.note')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      {error && <p className="error">{error}</p>}

      <div className="row">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          {t('pin.cancel')}
        </Button>
        <Button type="submit" disabled={saving} style={{ flex: 1 }}>
          {saving ? t('pin.saving') : t('pin.save')}
        </Button>
      </div>
    </form>
  )
}
