import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  X,
  ImageUp,
  Eraser,
  Video,
  Plus,
  MapPin,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "../ui/Button";
import { usePins } from "../../hooks/usePins";
import { isBuiltInCategory, type Category } from "../../lib/categories";
import { useCategoriesCtx } from "../../hooks/CategoriesContext";
import { useI18n } from "../../hooks/I18nContext";
import { useSubscription } from "../../hooks/useSubscription";
import { compressImage } from "../../lib/imageCompress";
import {
  uploadToCloudinary,
  getImageUrl,
  MAX_VIDEO_BYTES,
} from "../../lib/cloudinary";
import { toPinImageRows, uploadPinMediaFiles } from "../../lib/pinMediaUpload";
import {
  savePendingUploads,
  clearPendingUploadsForPin,
} from "../../lib/pendingUploads";
import { MAX_PIN_CATEGORIES } from "../../lib/pinCategories";
import { reverseGeocode } from "../../lib/geocoding";
import { searchPlaces, type PlaceSearchResult } from "../../lib/placeSearch";
import {
  normalizeAddress,
  normalizeCityName,
  pickVietnamProvinceFromAddress,
} from "../../lib/locationNames";
import { useToast } from "../../hooks/ToastContext";
import { usePinsCtx } from "../../hooks/PinsContext";
import { supabase } from "../../lib/supabase";

interface Props {
  coupleId: string;
  userId: string;
  coords: { lat: number; lng: number; accuracy?: number | null };
  onCreated: () => void;
  onCancel: () => void;
}

interface SelectedMediaFile {
  id: string;
  file: File;
  previewUrl: string;
}

const CUSTOM_EMOJIS = [
  "❤️",
  "🌸",
  "⭐",
  "🎈",
  "🍕",
  "🐱",
  "🐶",
  "🌈",
  "🎵",
  "⚽",
  "📸",
  "✨",
  "🏠",
  "🎂",
  "🍷",
];

function createSelectedMediaFile(file: File): SelectedMediaFile {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: `${file.name}-${file.lastModified}-${file.size}-${randomId}`,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

function startAfterNextPaint(task: () => void) {
  const run = () => window.setTimeout(task, 0);
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(run);
    return;
  }
  run();
}

export function CreatePinForm({
  coupleId,
  userId,
  coords,
  onCreated,
  onCancel,
}: Props) {
  const { createPin } = usePins(coupleId, userId);
  const {
    allCategories,
    customCategories,
    getCategory,
    saveCustomCategory,
    deleteCustomCategory,
  } = useCategoriesCtx();
  const { t, lang } = useI18n();
  const { canUploadVideo, canCreateCategory, limits } = useSubscription();
  const { showToast } = useToast();
  const {
    setUploadProgress,
    clearUploadProgress,
    fetchPinImages,
    bumpPinsVersion,
  } = usePinsCtx();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [markerEmoji, setMarkerEmoji] = useState<string | null>(null);
  const [markerImageUrl, setMarkerImageUrl] = useState<string | null>(null);
  const [markerUploading, setMarkerUploading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [customEmojiInput, setCustomEmojiInput] = useState("");
  const [showCustomTag, setShowCustomTag] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [customTagName, setCustomTagName] = useState("");
  const [customTagEmoji, setCustomTagEmoji] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressResults, setAddressResults] = useState<PlaceSearchResult[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressEdited, setAddressEdited] = useState(false);
  const [pinCoords, setPinCoords] = useState(coords);

  const cameraInput = useRef<HTMLInputElement | null>(null);
  const libraryInput = useRef<HTMLInputElement | null>(null);
  const videoInput = useRef<HTMLInputElement | null>(null);
  const markerInput = useRef<HTMLInputElement | null>(null);
  const addressDebounce = useRef<number | null>(null);
  const skipReverseGeocode = useRef(false);
  const manualPinCoordsRef = useRef(false);
  const lastAutoCoordsRef = useRef(coords);
  const selectedMediaRef = useRef<SelectedMediaFile[]>([]);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const VISIBLE_ROWS = 2;
  const ITEMS_PER_ROW = 3;
  const maxVisibleItems = VISIBLE_ROWS * ITEMS_PER_ROW;
  const files = selectedMedia.map(({ file }) => file);

  useEffect(() => {
    selectedMediaRef.current = selectedMedia;
  }, [selectedMedia]);

  useEffect(
    () => () => {
      selectedMediaRef.current.forEach(({ previewUrl }) =>
        URL.revokeObjectURL(previewUrl),
      );
    },
    [],
  );

  useEffect(() => {
    if (manualPinCoordsRef.current || addressEdited) return;
    const previous = lastAutoCoordsRef.current;
    const sameCoords =
      previous.lat === coords.lat &&
      previous.lng === coords.lng &&
      (previous.accuracy ?? null) === (coords.accuracy ?? null);
    if (sameCoords) return;
    lastAutoCoordsRef.current = coords;
    setAddressLoading(true);
    setAddressResults([]);
    setPinCoords(coords);
  }, [addressEdited, coords, coords.accuracy, coords.lat, coords.lng]);

  useEffect(() => {
    let cancelled = false;
    if (skipReverseGeocode.current) {
      skipReverseGeocode.current = false;
      return () => {
        cancelled = true;
      };
    }
    reverseGeocode(pinCoords.lat, pinCoords.lng, "vi")
      .then((geo) => {
        if (cancelled) return;
        setAddress(normalizeAddress(geo.address));
        setCity(normalizeCityName(geo.city));
        setCountry(geo.country);
      })
      .catch(() => {
        if (!cancelled) setAddress("");
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pinCoords.lat, pinCoords.lng]);

  useEffect(() => {
    if (!addressEdited || address.trim().length < 3) {
      return;
    }
    if (addressDebounce.current) clearTimeout(addressDebounce.current);
    addressDebounce.current = window.setTimeout(async () => {
      setAddressSearching(true);
      try {
        const language = "vi";
        const proximity = { lat: pinCoords.lat, lng: pinCoords.lng };
        const results = await searchPlaces(address, { language, proximity });
        setAddressResults(results);
      } catch {
        setAddressResults([]);
      } finally {
        setAddressSearching(false);
      }
    }, 400);
  }, [address, addressEdited, pinCoords.lat, pinCoords.lng]);

  function addFiles(list: FileList | null, kind: "image" | "video") {
    const incoming = Array.from(list ?? []).filter((file) => {
      if (file.size <= 0) return false;
      return kind === "video"
        ? file.type.startsWith("video/")
        : file.type.startsWith("image/");
    });
    if (incoming.length === 0) return;
    // Gate: already at limit
    if (selectedMedia.length >= limits.photosPerPin) {
      setError(
        lang === "vi"
          ? `Giới hạn ${limits.photosPerPin} ảnh/video. Nâng cấp để thêm.`
          : `Limit ${limits.photosPerPin} photos/videos. Upgrade to add more.`,
      );
      return;
    }
    // Validate video size
    for (const f of incoming) {
      if (f.type.startsWith("video/") && f.size > MAX_VIDEO_BYTES) {
        setError(`Video quá lớn (max ${MAX_VIDEO_BYTES / 1024 / 1024}MB)`);
        return;
      }
    }
    setError(null);
    const remaining = limits.photosPerPin - selectedMedia.length;
    if (remaining <= 0) return;
    const nextMedia = incoming.slice(0, remaining).map(createSelectedMediaFile);
    setSelectedMedia((prev) => [...prev, ...nextMedia]);
  }

  function removeFile(i: number) {
    const removed = selectedMedia[i];
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    setSelectedMedia((prev) => prev.filter((_, idx) => idx !== i));
    setError(null);
  }

  async function handleMarkerUpload(file: File | undefined) {
    if (!file) return;
    setMarkerUploading(true);
    try {
      const compressed = await compressImage(file);
      const res = await uploadToCloudinary(compressed, {
        folder: `pinly/${coupleId}`,
      });
      setMarkerImageUrl(res.url);
      setMarkerEmoji(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarkerUploading(false);
    }
  }

  function handleCustomEmojiCommit() {
    const trimmed = customEmojiInput.trim();
    if (trimmed) {
      setMarkerEmoji(trimmed);
      setMarkerImageUrl(null);
    }
    setCustomEmojiInput("");
  }

  function openCreateCustomTag() {
    setEditingTagId(null);
    setCustomTagName("");
    setCustomTagEmoji("");
    setShowCustomTag(true);
  }

  function openEditCustomTag(cat: Category) {
    setEditingTagId(cat.id);
    setCustomTagName(cat.label);
    setCustomTagEmoji(cat.emoji);
    setShowCustomTag(true);
  }

  function toggleCategory(categoryId: string) {
    setSelectedCategoryIds((current) => {
      if (current.includes(categoryId)) {
        return current.filter((id) => id !== categoryId);
      }
      if (current.length >= MAX_PIN_CATEGORIES) {
        setError(
          lang === "vi"
            ? `Chọn tối đa ${MAX_PIN_CATEGORIES} danh mục.`
            : `Choose up to ${MAX_PIN_CATEGORIES} categories.`,
        );
        return current;
      }
      setError(null);
      return [...current, categoryId];
    });
  }

  function selectCategoryIfPossible(categoryId: string) {
    setSelectedCategoryIds((current) => {
      if (current.includes(categoryId)) return current;
      if (current.length >= MAX_PIN_CATEGORIES) return current;
      return [...current, categoryId];
    });
  }

  async function handleSaveCustomTag() {
    if (!customTagName.trim()) return;
    // Gate: check custom category limit (only for new categories, not edits)
    if (!editingTagId && !canCreateCategory(customCategories.length)) {
      setError(
        lang === "vi"
          ? "Giới hạn danh mục tuỳ chỉnh. Nâng cấp để tạo thêm."
          : "Custom category limit reached. Upgrade your plan.",
      );
      return;
    }
    const id =
      editingTagId ??
      `custom_${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now()}`;
    const newCat: Category = {
      id,
      label: customTagName.trim(),
      emoji: customTagEmoji.trim() || "🏷️",
      color: "#6b7280",
    };
    try {
      await saveCustomCategory(newCat);
      selectCategoryIfPossible(id);
      setShowCustomTag(false);
      setEditingTagId(null);
      setCustomTagName("");
      setCustomTagEmoji("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteCustomTag(id: string) {
    try {
      await deleteCustomCategory(id);
      setSelectedCategoryIds((current) =>
        current.filter((categoryId) => categoryId !== id),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function pickCity(place: PlaceSearchResult): string | null {
    const a = place.address;
    return (
      pickVietnamProvinceFromAddress(place.display_name) ??
      normalizeCityName(
        a?.state ??
          a?.province ??
          a?.city ??
          a?.county ??
          a?.town ??
          a?.village,
      )
    );
  }

  function selectAddressResult(place: PlaceSearchResult) {
    setAddress(normalizeAddress(place.display_name));
    setAddressResults([]);
    setAddressEdited(false);
    skipReverseGeocode.current = true;
    manualPinCoordsRef.current = true;
    setPinCoords({
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
      accuracy: null,
    });
    setCity(normalizeCityName(pickCity(place)));
    setCountry(place.address?.country ?? null);
  }

  function previewIcon() {
    if (markerImageUrl) {
      return (
        <img
          src={getImageUrl(markerImageUrl, 80)}
          alt=""
          className="marker-preview-img"
        />
      );
    }
    if (markerEmoji)
      return <span className="marker-preview-emoji">{markerEmoji}</span>;
    const cat = getCategory(selectedCategoryIds[0] ?? null);
    if (cat) return <span className="marker-preview-emoji">{cat.emoji}</span>;
    return <span className="marker-preview-emoji">📍</span>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError(t("pin.required"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const mediaFiles = selectedMedia.map(({ file }) => file);
      const pin = await createPin({
        title: title.trim(),
        note: note.trim() || undefined,
        category: selectedCategoryIds[0] ?? undefined,
        categoryIds: selectedCategoryIds,
        marker_emoji: markerEmoji,
        marker_image_url: markerImageUrl,
        lat: pinCoords.lat,
        lng: pinCoords.lng,
        address: normalizeAddress(address.trim()) || null,
        city: normalizeCityName(city),
        country,
        images: [],
      });

      if (mediaFiles.length === 0) {
        showToast({ type: "success", title: t("toast.memoryCreated") });
        setSaving(false);
        onCreated();
        return;
      }

      setUploadProgress(pin.id, 0);
      showToast({ type: "success", title: t("toast.memoryCreated") });
      setSaving(false);
      onCreated();

      // Upload in background after the created-memory UI has had a frame to paint.
      startAfterNextPaint(() => {
        void savePendingUploads(pin.id, coupleId, mediaFiles)
          .then(() =>
            uploadPinMediaFiles(mediaFiles, `pinly/${coupleId}`, (pct) =>
              setUploadProgress(pin.id, pct),
            ),
          )
          .then(async (uploaded) => {
            if (uploaded.length > 0) {
              const { error: imgErr } = await supabase
                .from("pin_images")
                .insert(toPinImageRows(pin.id, uploaded));
              if (imgErr) throw imgErr;
              await fetchPinImages(pin.id);
              bumpPinsVersion();
            }
            await clearPendingUploadsForPin(pin.id);
          })
          .catch((err) => {
            console.warn("Background upload error:", err);
            showToast({ type: "error", title: t("toast.photoUploadFailed") });
          })
          .finally(() => {
            clearUploadProgress(pin.id);
          });
      });
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : String(e));
      showToast({ type: "error", title: t("toast.actionFailed") });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="pin-form create-pin-form">
      <div className="field-with-count">
        <input
          type="text"
          placeholder={t("pin.title")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          required
        />
        <span className="char-count">{title.length}/60</span>
      </div>

      <div>
        <div className="field-label">{t("pin.category")}</div>
        <div className="category-grid">
          {(categoriesExpanded
            ? allCategories
            : allCategories.slice(0, maxVisibleItems)
          ).map((c) => {
            const active = selectedCategoryIds.includes(c.id);
            const custom = !isBuiltInCategory(c.id);
            return (
              <div key={c.id} className="category-chip-wrap">
                <button
                  type="button"
                  className={`category-chip ${active ? "active" : ""}`}
                  style={
                    active
                      ? {
                          background: c.color,
                          borderColor: c.color,
                          color: "white",
                        }
                      : undefined
                  }
                  onClick={() => toggleCategory(c.id)}
                >
                  <span className="emoji">{c.emoji}</span>
                  <span>{c.label}</span>
                </button>
                {custom && (
                  <>
                    <button
                      type="button"
                      className="category-delete-btn"
                      onClick={() => handleDeleteCustomTag(c.id)}
                      aria-label="Delete tag"
                    >
                      <Trash2 size={10} />
                    </button>
                    <button
                      type="button"
                      className="category-edit-btn"
                      onClick={() => openEditCustomTag(c)}
                      aria-label="Edit tag"
                    >
                      <Pencil size={10} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {categoriesExpanded && (
            <button
              type="button"
              className="category-chip"
              onClick={openCreateCustomTag}
            >
              <span className="emoji">
                <Plus size={14} />
              </span>
              <span>{t("pin.addTag")}</span>
            </button>
          )}
        </div>
        {allCategories.length + 1 > maxVisibleItems && (
          <button
            type="button"
            className="category-toggle-btn"
            onClick={() => setCategoriesExpanded((v) => !v)}
          >
            {categoriesExpanded ? (
              <>
                <ChevronUp size={14} /> {t("pin.showLess")}
              </>
            ) : (
              <>
                <ChevronDown size={14} /> {t("pin.showMore")} (
                {allCategories.length - maxVisibleItems + 1})
              </>
            )}
          </button>
        )}
        {showCustomTag && (
          <div className="custom-tag-form">
            <input
              type="text"
              placeholder={t("pin.tagEmoji")}
              value={customTagEmoji}
              onChange={(e) => setCustomTagEmoji(e.target.value)}
              maxLength={4}
              className="custom-tag-emoji-input"
            />
            <input
              type="text"
              placeholder={t("pin.tagName")}
              value={customTagName}
              onChange={(e) => setCustomTagName(e.target.value)}
              maxLength={30}
              className="custom-tag-name-input"
            />
            <Button
              type="button"
              onClick={handleSaveCustomTag}
              disabled={!customTagName.trim()}
            >
              {t("pin.saveTag")}
            </Button>
          </div>
        )}
      </div>

      <div>
        <div className="field-label">{t("pin.marker")}</div>
        <div className="marker-picker">
          <div className="marker-preview">{previewIcon()}</div>
          <div className="marker-picker-options">
            <div className="marker-emoji-row">
              {CUSTOM_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`marker-emoji-btn ${markerEmoji === e ? "active" : ""}`}
                  onClick={() => {
                    setMarkerEmoji(e === markerEmoji ? null : e);
                    if (e !== markerEmoji) setMarkerImageUrl(null);
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
                placeholder={t("pin.emojiKeyboard")}
                value={customEmojiInput}
                onChange={(e) => setCustomEmojiInput(e.target.value)}
                onBlur={handleCustomEmojiCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCustomEmojiCommit();
                  }
                }}
                maxLength={4}
              />
            </div>
            <div className="row">
              <button
                type="button"
                className="photo-btn small"
                onClick={() => markerInput.current?.click()}
                disabled={markerUploading}
              >
                <ImageUp size={16} />{" "}
                {markerUploading ? "…" : t("pin.markerUpload")}
              </button>
              {(markerEmoji || markerImageUrl) && (
                <button
                  type="button"
                  className="photo-btn small"
                  onClick={() => {
                    setMarkerEmoji(null);
                    setMarkerImageUrl(null);
                  }}
                >
                  <Eraser size={16} /> {t("pin.markerClear")}
                </button>
              )}
            </div>
            <input
              ref={markerInput}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                handleMarkerUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      <textarea
        placeholder={t("pin.note")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />

      <div>
        <div className="field-label">{t("pin.address")}</div>
        <div className="address-input-wrap">
          <MapPin size={15} />
          <input
            type="text"
            value={address}
            onChange={(e) => {
              const next = e.target.value;
              setAddress(next);
              setAddressEdited(true);
              if (next.trim().length < 3) setAddressResults([]);
            }}
            placeholder={
              addressLoading
                ? t("pin.addressLoading")
                : t("pin.addressPlaceholder")
            }
          />
          {address && (
            <button
              type="button"
              className="address-clear-btn"
              onClick={() => {
                setAddress("");
                setAddressEdited(true);
                setAddressResults([]);
              }}
              aria-label="Clear address"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {addressSearching && (
          <div className="muted small address-status">
            {t("wish.searching")}
          </div>
        )}
        {addressResults.length > 0 && (
          <div className="search-results address-results">
            {addressResults.map((r, i) => (
              <button
                key={`${r.lat}-${r.lon}-${i}`}
                type="button"
                className="search-result"
                onClick={() => selectAddressResult(r)}
              >
                <MapPin size={14} />
                <span>{r.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="field-label">
          {t("pin.media")} ({files.length}/{limits.photosPerPin})
        </div>
        <div className="photo-buttons">
          <button
            type="button"
            className="photo-btn"
            onClick={() => {
              if (cameraInput.current) cameraInput.current.value = "";
              cameraInput.current?.click();
            }}
            disabled={files.length >= limits.photosPerPin}
          >
            <Camera size={20} /> {t("pin.takePhoto")}
          </button>
          <button
            type="button"
            className="photo-btn"
            onClick={() => {
              if (libraryInput.current) libraryInput.current.value = "";
              libraryInput.current?.click();
            }}
            disabled={files.length >= limits.photosPerPin}
          >
            <ImagePlus size={20} /> {t("pin.fromLibrary")}
          </button>
          <button
            type="button"
            className="photo-btn"
            onClick={() => {
              if (!canUploadVideo) {
                setError(
                  lang === "vi"
                    ? "Video cần gói Pro"
                    : "Video requires Pro plan",
                );
                return;
              }
              if (videoInput.current) videoInput.current.value = "";
              videoInput.current?.click();
            }}
            disabled={files.length >= limits.photosPerPin}
          >
            <Video size={20} /> {t("pin.addVideo")} {!canUploadVideo && "🔒"}
          </button>
        </div>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            addFiles(e.target.files, "image");
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            addFiles(e.target.files, "image");
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          onChange={(e) => {
            addFiles(e.target.files, "video");
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
        {files.length > 0 && (
          <div className="photo-previews">
            {selectedMedia.map(({ id, file, previewUrl }, i) => (
              <div key={id} className="photo-preview">
                {file.type.startsWith("video/") ? (
                  <video
                    src={previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img src={previewUrl} alt="" decoding="async" />
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="muted small" style={{ marginTop: 4 }}>
          {t("pin.videoHint")}
        </p>
      </div>

      <div className="muted small">
        {pinCoords.lat.toFixed(5)}, {pinCoords.lng.toFixed(5)}
        {pinCoords.accuracy ? ` · ±${Math.round(pinCoords.accuracy)}m` : ""}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="row">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={saving}
        >
          {t("pin.cancel")}
        </Button>
        <Button type="submit" disabled={saving} style={{ flex: 1 }}>
          {saving ? t("pin.saving") : t("pin.save")}
        </Button>
      </div>
    </form>
  );
}
