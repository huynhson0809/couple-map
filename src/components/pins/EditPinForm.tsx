import { useRef, useState } from 'react'
import { ImageUp, Eraser, Plus, Trash2, Video, Pencil } from 'lucide-react'
import { Button } from '../ui/Button'
import { usePinsCtx } from '../../hooks/PinsContext'
import { isBuiltInCategory, type Category } from '../../lib/categories'
import { useCategoriesCtx } from '../../hooks/CategoriesContext'
import { useI18n } from '../../hooks/I18nContext'
import { compressImage } from '../../lib/imageCompress'
import { uploadToCloudinary, getImageUrl, isVideoUrl, getVideoUrl, MAX_VIDEO_BYTES } from '../../lib/cloudinary'
import { supabase } from '../../lib/supabase'
import { deletePinMedia, type CloudinaryDeleteAsset } from '../../lib/cloudinary-delete'
import type { Pin, PinImage } from '../../types'

interface Props {
  pin: Pin
  onSaved: () => void
  onCancel: () => void
}

const CUSTOM_EMOJIS = ['❤️', '🌸', '⭐', '🎈', '🍕', '🐱', '🐶', '🌈', '🎵', '⚽', '📸', '✨', '🏠', '🎂', '🍷']

export function EditPinForm({ pin, onSaved, onCancel }: Props) {
  const { updatePin } = usePinsCtx()
  const {
    allCategories,
    getCategory,
    saveCustomCategory,
    deleteCustomCategory,
  } = useCategoriesCtx()
  const { t } = useI18n()
  const [title, setTitle] = useState(pin.title)
  const [note, setNote] = useState(pin.note ?? '')
  const [category, setCategory] = useState<string | null>(pin.category)
  const [markerEmoji, setMarkerEmoji] = useState<string | null>(pin.marker_emoji)
  const [markerImageUrl, setMarkerImageUrl] = useState<string | null>(pin.marker_image_url)
  const [markerUploading, setMarkerUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [customEmojiInput, setCustomEmojiInput] = useState('')
  const [showCustomTag, setShowCustomTag] = useState(false)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [customTagName, setCustomTagName] = useState('')
  const [customTagEmoji, setCustomTagEmoji] = useState('')
  const markerInput = useRef<HTMLInputElement | null>(null)

  // --- Media management ---
  const [existingImages, setExistingImages] = useState<PinImage[]>(pin.images ?? [])
  const [removedImages, setRemovedImages] = useState<CloudinaryDeleteAsset[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [mediaUploading, setMediaUploading] = useState(false)
  const mediaInput = useRef<HTMLInputElement | null>(null)
  const videoInput = useRef<HTMLInputElement | null>(null)

  async function handleMarkerUpload(file: File | undefined) {
    if (!file) return
    setMarkerUploading(true)
    try {
      const compressed = await compressImage(file)
      const res = await uploadToCloudinary(compressed, { folder: `pinly/${pin.couple_id}` })
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

  function openCreateCustomTag() {
    setEditingTagId(null)
    setCustomTagName('')
    setCustomTagEmoji('')
    setShowCustomTag(true)
  }

  function openEditCustomTag(cat: Category) {
    setEditingTagId(cat.id)
    setCustomTagName(cat.label)
    setCustomTagEmoji(cat.emoji)
    setShowCustomTag(true)
  }

  async function handleSaveCustomTag() {
    if (!customTagName.trim()) return
    const id =
      editingTagId ??
      `custom_${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now()}`
    const newCat: Category = {
      id,
      label: customTagName.trim(),
      emoji: customTagEmoji.trim() || '🏷️',
      color: '#6b7280',
    }
    try {
      await saveCustomCategory(newCat)
      setCategory(id)
      setShowCustomTag(false)
      setEditingTagId(null)
      setCustomTagName('')
      setCustomTagEmoji('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDeleteCustomTag(id: string) {
    try {
      await deleteCustomCategory(id)
      if (category === id) setCategory(null)
      if (editingTagId === id) {
        setShowCustomTag(false)
        setEditingTagId(null)
        setCustomTagName('')
        setCustomTagEmoji('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // --- Media helpers ---
  function handleRemoveExisting(img: PinImage) {
    setRemovedImages((prev) => [
      ...prev,
      {
        id: img.id,
        publicId: img.cloudinary_public_id ?? '',
        resourceType: isVideoUrl(img.cloudinary_url) ? 'video' : 'image',
      },
    ])
    setExistingImages((prev) => prev.filter((i) => i.id !== img.id))
  }

  function handleAddMedia(files: FileList | null, kind: 'image' | 'video') {
    const arr = Array.from(files ?? []).filter((file) => {
      if (file.size <= 0) return false
      return kind === 'video'
        ? file.type.startsWith('video/')
        : file.type.startsWith('image/')
    })
    if (arr.length === 0) return
    for (const f of arr) {
      if (f.type.startsWith('video/') && f.size > MAX_VIDEO_BYTES) {
        setError(`Video quá lớn (tối đa ${MAX_VIDEO_BYTES / 1024 / 1024}MB)`)
        return
      }
    }
    setNewFiles((prev) => [...prev, ...arr])
  }

  function handleRemoveNewFile(idx: number) {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx))
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
      // 1. Delete removed media from Cloudinary and DB after the user confirms Save.
      if (removedImages.length > 0) {
        await deletePinMedia(removedImages)
      }

      // 2. Upload new files
      if (newFiles.length > 0) {
        setMediaUploading(true)
        const uploads = await Promise.all(
          newFiles.map(async (file) => {
            const isVideo = file.type.startsWith('video/')
            const toUpload = isVideo ? file : await compressImage(file)
            return uploadToCloudinary(toUpload, { folder: `pinly/${pin.couple_id}` })
          }),
        )
        const startOrder = existingImages.length
        const rows = uploads.map((img, i) => ({
          pin_id: pin.id,
          cloudinary_url: img.url,
          cloudinary_public_id: img.publicId,
          width: img.width,
          height: img.height,
          sort_order: startOrder + i,
        }))
        const { error: imgErr } = await supabase.from('pin_images').insert(rows)
        if (imgErr) throw imgErr
        setMediaUploading(false)
      }

      // 3. Update pin fields
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
      setMediaUploading(false)
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
          {allCategories.map((c) => {
            const active = category === c.id
            const custom = !isBuiltInCategory(c.id)
            return (
              <div key={c.id} className="category-chip-wrap">
                <button
                  type="button"
                  className={`category-chip ${active ? 'active' : ''}`}
                  style={active ? { background: c.color, borderColor: c.color, color: 'white' } : undefined}
                  onClick={() => setCategory(active ? null : c.id)}
                >
                  <span className="emoji">{c.emoji}</span>
                  <span>{c.label}</span>
                </button>
                {custom && (
                  <>
                    <button
                      type="button"
                      className="category-edit-btn"
                      onClick={() => openEditCustomTag(c)}
                      aria-label="Edit tag"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      type="button"
                      className="category-delete-btn"
                      onClick={() => handleDeleteCustomTag(c.id)}
                      aria-label="Delete tag"
                    >
                      <Trash2 size={10} />
                    </button>
                  </>
                )}
              </div>
            )
          })}
          <button
            type="button"
            className="category-chip"
            onClick={openCreateCustomTag}
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
            <Button type="button" onClick={handleSaveCustomTag} disabled={!customTagName.trim()}>
              {t('pin.saveTag')}
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

      {/* --- Media section --- */}
      <div>
        <div className="field-label">{t('pin.media')}</div>
        <div className="photo-previews">
          {existingImages.map((img) => (
            <div key={img.id} className={`photo-preview ${isVideoUrl(img.cloudinary_url) ? 'video-item' : ''}`}>
              {isVideoUrl(img.cloudinary_url) ? (
                <video src={getVideoUrl(img.cloudinary_url, 200)} muted playsInline preload="metadata" />
              ) : (
                <img src={getImageUrl(img.cloudinary_url, 200)} alt="" />
              )}
              <button type="button" onClick={() => handleRemoveExisting(img)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {newFiles.map((f, i) => (
            <div key={i} className={`photo-preview ${f.type.startsWith('video/') ? 'video-item' : ''}`}>
              {f.type.startsWith('video/') ? (
                <video src={URL.createObjectURL(f)} muted playsInline preload="metadata" />
              ) : (
                <img src={URL.createObjectURL(f)} alt="" />
              )}
              <button type="button" onClick={() => handleRemoveNewFile(i)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="photo-btn small"
            onClick={() => {
              if (mediaInput.current) mediaInput.current.value = ''
              mediaInput.current?.click()
            }}
          >
            <ImageUp size={16} /> {t('pin.addPhoto')}
          </button>
          <button
            type="button"
            className="photo-btn small"
            onClick={() => {
              if (videoInput.current) videoInput.current.value = ''
              videoInput.current?.click()
            }}
          >
            <Video size={16} /> {t('pin.addVideo')}
          </button>
        </div>
        <input
          ref={mediaInput}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { handleAddMedia(e.target.files, 'image'); e.target.value = '' }}
        />
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={(e) => { handleAddMedia(e.target.files, 'video'); e.target.value = '' }}
        />
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
        <Button type="submit" disabled={saving || mediaUploading} style={{ flex: 1 }}>
          {mediaUploading ? '⬆️ ...' : saving ? t('pin.saving') : t('pin.save')}
        </Button>
      </div>
    </form>
  )
}
