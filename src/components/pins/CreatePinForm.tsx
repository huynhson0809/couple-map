import { useRef, useState } from 'react'
import { Camera, ImagePlus, X, ImageUp, Eraser, Video, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { useImageUpload } from '../../hooks/useImageUpload'
import { usePins } from '../../hooks/usePins'
import { getCategory, getAllCategories, saveCustomCategory, type Category } from '../../lib/categories'
import { useI18n } from '../../hooks/I18nContext'
import { compressImage } from '../../lib/imageCompress'
import { uploadToCloudinary, getImageUrl, MAX_VIDEO_BYTES } from '../../lib/cloudinary'

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
  const [customEmojiInput, setCustomEmojiInput] = useState('')
  const [showCustomTag, setShowCustomTag] = useState(false)
  const [customTagName, setCustomTagName] = useState('')
  const [customTagEmoji, setCustomTagEmoji] = useState('')

  const cameraInput = useRef<HTMLInputElement | null>(null)
  const libraryInput = useRef<HTMLInputElement | null>(null)
  const videoInput = useRef<HTMLInputElement | null>(null)
  const markerInput = useRef<HTMLInputElement | null>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list)
    // Validate video size
    for (const f of incoming) {
      if (f.type.startsWith('video/') && f.size > MAX_VIDEO_BYTES) {
        setError(`Video quá lớn (max ${MAX_VIDEO_BYTES / 1024 / 1024}MB)`)
        return
      }
    }
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

  function handleCustomEmojiCommit() {
    const trimmed = customEmojiInput.trim()
    if (trimmed) {
      setMarkerEmoji(trimmed)
      setMarkerImageUrl(null)
    }
    setCustomEmojiInput('')
  }

  function handleAddCustomTag() {
    if (!customTagName.trim()) return
    const id = `custom_${Date.now()}`
    const newCat: Category = {
      id,
      label: customTagName.trim(),
      emoji: customTagEmoji.trim() || '🏷️',
      color: '#6b7280',
    }
    saveCustomCategory(newCat)
    setCategory(id)
    setShowCustomTag(false)
    setCustomTagName('')
    setCustomTagEmoji('')
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

  const allCategories = getAllCategories()

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
          {allCategories.map((c) => {
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
          <button
            type="button"
            className="category-chip"
            onClick={() => setShowCustomTag(true)}
          >
            <span className="emoji"><Plus size={14} /></span>
            <span>{t('pin.addTag')}</span>
          </button>
        </div>
        {showCustomTag && (
          <div className="custom-tag-form">
            <input
              type="text"
              placeholder={t('pin.tagEmoji')}
              value={customTagEmoji}
              onChange={(e) => setCustomTagEmoji(e.target.value)}
              maxLength={4}
              className="custom-tag-emoji-input"
            />
            <input
              type="text"
              placeholder={t('pin.tagName')}
              value={customTagName}
              onChange={(e) => setCustomTagName(e.target.value)}
              maxLength={30}
              className="custom-tag-name-input"
            />
            <Button type="button" onClick={handleAddCustomTag} disabled={!customTagName.trim()}>
              {t('pin.save')}
            </Button>
          </div>
        )}
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
            <div className="marker-keyboard-row">
              <input
                type="text"
                className="emoji-keyboard-input"
                placeholder={t('pin.emojiKeyboard')}
                value={customEmojiInput}
                onChange={(e) => setCustomEmojiInput(e.target.value)}
                onBlur={handleCustomEmojiCommit}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCustomEmojiCommit() } }}
                maxLength={8}
              />
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
        <div className="field-label">{t('pin.media')} ({files.length}/5)</div>
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
          <button
            type="button"
            className="photo-btn"
            onClick={() => videoInput.current?.click()}
            disabled={files.length >= 5}
          >
            <Video size={20} /> {t('pin.addVideo')}
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
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
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
                {f.type.startsWith('video/') ? (
                  <video src={URL.createObjectURL(f)} muted />
                ) : (
                  <img src={URL.createObjectURL(f)} alt="" />
                )}
                <button type="button" onClick={() => removeFile(i)} aria-label="Remove">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="muted small" style={{ marginTop: 4 }}>{t('pin.videoHint')}</p>
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
