import { useRef, useState } from 'react'
import { Camera, ImagePlus, X, ImageUp, Eraser } from 'lucide-react'
import { Button } from '../ui/Button'
import { useImageUpload } from '../../hooks/useImageUpload'
import { usePins } from '../../hooks/usePins'
import { CATEGORIES, getCategory } from '../../lib/categories'
import { useI18n } from '../../hooks/I18nContext'
import { compressImage } from '../../lib/imageCompress'
import { uploadToCloudinary, getImageUrl } from '../../lib/cloudinary'

interface Props {
  coupleId: string
  userId: string
  coords: { lat: number; lng: number }
  onCreated: () => void
  onCancel: () => void
}

const CUSTOM_EMOJIS = ['❤️', '🌸', '⭐', '🎈', '🍕', '🐱', '🐶', '🌈', '🎵', '⚽', '📸', '✨', '🏠', '🎂', '🍷']

export function CreatePinForm({ coupleId, userId, coords, onCreated, onCancel }: Props) {
  const { createPin } = usePins(coupleId, userId)
  const { uploadFiles, uploading, progress } = useImageUpload()
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [markerEmoji, setMarkerEmoji] = useState<string | null>(null)
  const [markerImageUrl, setMarkerImageUrl] = useState<string | null>(null)
  const [markerUploading, setMarkerUploading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const cameraInput = useRef<HTMLInputElement | null>(null)
  const libraryInput = useRef<HTMLInputElement | null>(null)
  const markerInput = useRef<HTMLInputElement | null>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list)
    setFiles((prev) => [...prev, ...incoming].slice(0, 5))
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
  }

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
      const images = files.length > 0 ? await uploadFiles(files) : []
      await createPin({
        title: title.trim(),
        note: note.trim() || undefined,
        category: category ?? undefined,
        marker_emoji: markerEmoji,
        marker_image_url: markerImageUrl,
        lat: coords.lat,
        lng: coords.lng,
        images,
      })
      onCreated()
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

      <div>
        <div className="field-label">{t('pin.photos')} ({files.length}/5)</div>
        <div className="photo-buttons">
          <button
            type="button"
            className="photo-btn"
            onClick={() => cameraInput.current?.click()}
            disabled={files.length >= 5}
          >
            <Camera size={20} /> {t('pin.takePhoto')}
          </button>
          <button
            type="button"
            className="photo-btn"
            onClick={() => libraryInput.current?.click()}
            disabled={files.length >= 5}
          >
            <ImagePlus size={20} /> {t('pin.fromLibrary')}
          </button>
        </div>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
          style={{ display: 'none' }}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
          style={{ display: 'none' }}
        />
        {files.length > 0 && (
          <div className="photo-previews">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="photo-preview">
                <img src={URL.createObjectURL(f)} alt="" />
                <button type="button" onClick={() => removeFile(i)} aria-label="Remove">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="muted small">
        📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
      </div>

      {uploading && <div className="muted small">{t('pin.uploading')} {progress}%…</div>}
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
