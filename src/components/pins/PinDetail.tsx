import { useState } from "react";
import {
  Trash2,
  MapPin,
  ExternalLink,
  Pencil,
  Share2,
  Image,
} from "lucide-react";
import type { Pin } from "../../types";
import { getImageUrl, isVideoUrl, getVideoUrl } from "../../lib/cloudinary";
import { Button } from "../ui/Button";
import { ImageLightbox } from "../ui/ImageLightbox";
import { EditPinForm } from "./EditPinForm";
import { ShareCard } from "../share/ShareCard";
import { getCategory } from "../../lib/categories";
import { useI18n } from "../../hooks/I18nContext";

interface Props {
  pin: Pin;
  currentUserId: string | undefined;
  onDelete: (id: string) => Promise<void>;
  onUpdated?: () => void;
}

const EDIT_WINDOW_MS = 60 * 60 * 1000;

export function PinDetail({ pin, currentUserId, onDelete, onUpdated }: Props) {
  const { t, lang } = useI18n();
  const [deleting, setDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);

  const isMine = pin.created_by === currentUserId;
  const ageMs = Date.now() - new Date(pin.created_at).getTime();
  const withinEditWindow = ageMs < EDIT_WINDOW_MS;
  const canEdit = isMine && withinEditWindow;
  const images = pin.images ?? [];

  async function handleDelete() {
    if (!confirm(t("pin.deleteConfirm"))) return;
    setDeleting(true);
    try {
      await onDelete(pin.id);
    } finally {
      setDeleting(false);
    }
  }

  function openInMaps() {
    const url = `https://www.google.com/maps?q=${pin.lat},${pin.lng}`;
    window.open(url, "_blank");
  }

  async function share() {
    const text = `${pin.title}${pin.address ? ` — ${pin.address}` : ""}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: pin.title, text });
      } catch {
        /* user cancelled */
      }
    } else {
      navigator.clipboard?.writeText(text);
    }
  }

  if (editing) {
    return (
      <EditPinForm
        pin={pin}
        onSaved={() => {
          setEditing(false);
          onUpdated?.();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="pin-detail">
      {images.length > 0 && (
        <div className="image-strip">
          {images.map((img, i) => (
            isVideoUrl(img.cloudinary_url) ? (
              <div key={img.id} className="image-strip-item video-item">
                <video
                  src={getVideoUrl(img.cloudinary_url)}
                  controls
                  playsInline
                  preload="metadata"
                  style={{ width: '100%', borderRadius: 8 }}
                />
              </div>
            ) : (
              <button
                key={img.id}
                type="button"
                className="image-strip-item"
                onClick={() => setLightboxIndex(i)}
                aria-label="View full image"
              >
                <img src={getImageUrl(img.cloudinary_url, 800)} alt="" />
              </button>
            )
          ))}
        </div>
      )}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={images.map((img) => ({
            id: img.id,
            url: getImageUrl(img.cloudinary_url, 1600, 90),
          }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      <div className="pin-detail-body">
        {(() => {
          const cat = getCategory(pin.category);
          if (!cat) return null;
          return (
            <span
              className="category-badge"
              style={{ background: `${cat.color}1a`, color: cat.color }}
            >
              <span>{cat.emoji}</span> {cat.label}
            </span>
          );
        })()}
        <h2 className="pin-title">{pin.title}</h2>
        {pin.note && <p className="pin-note">{pin.note}</p>}
        <div className="pin-meta">
          <div className="meta-row">
            <MapPin size={14} />
            <span>
              {pin.address ?? `${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`}
            </span>
          </div>
          <div className="meta-row meta-date">
            {new Date(pin.created_at).toLocaleDateString(
              lang === "vi" ? "vi-VN" : undefined,
              {
                year: "numeric",
                month: "long",
                day: "numeric",
              },
            )}
          </div>
        </div>
      </div>
      <div className="pin-actions">
        <Button variant="secondary" onClick={openInMaps}>
          <ExternalLink size={16} /> {t("pin.openMaps")}
        </Button>
        <Button variant="secondary" onClick={() => setShowShareCard(true)}>
          <Image size={16} /> {t("share.card")}
        </Button>
        <Button variant="secondary" onClick={share}>
          <Share2 size={16} /> {t("pin.share")}
        </Button>
        {canEdit && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil size={16} /> {t("pin.edit")}
          </Button>
        )}
        {isMine && (
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            <Trash2 size={16} />{" "}
            {deleting ? t("pin.deleting") : t("pin.delete")}
          </Button>
        )}
      </div>
      {showShareCard && (
        <ShareCard pin={pin} onClose={() => setShowShareCard(false)} />
      )}
      {isMine && !withinEditWindow && (
        <p
          className="muted small"
          style={{ marginTop: 6 }}
          title={t("pin.editExpired")}
        >
          🔒 {t("pin.editExpired")}
        </p>
      )}
    </div>
  );
}
