import { useEffect, useRef, useState } from "react";
import {
  Trash2,
  MapPin,
  ExternalLink,
  Pencil,
  Share2,
  Image,
  Heart,
  Send,
  Star,
} from "lucide-react";
import type { Pin } from "../../types";
import { getImageUrl, isVideoUrl, getVideoUrl } from "../../lib/cloudinary";
import { Button } from "../ui/Button";
import { ImageLightbox } from "../ui/ImageLightbox";
import { EditPinForm } from "./EditPinForm";
import { ShareCard } from "../share/ShareCard";
import { useI18n } from "../../hooks/I18nContext";
import { useCategoriesCtx } from "../../hooks/CategoriesContext";
import { usePinInteractions } from "../../hooks/usePinInteractions";
import { usePinsCtx } from "../../hooks/PinsContext";
import type { ReactionType } from "../../types";

interface Props {
  pin: Pin;
  currentUserId: string | undefined;
  currentUserName?: string | null;
  onDelete: (id: string) => Promise<void>;
  onUpdated?: () => void;
  onFavoriteUpdated?: (pin: Pin) => void;
  onShowOnMap?: (pin: Pin) => void;
}

const EDIT_WINDOW_MS = 60 * 60 * 1000;
const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "love", emoji: "❤️", label: "Love" },
  { type: "care", emoji: "🥰", label: "Care" },
  { type: "haha", emoji: "😆", label: "Haha" },
  { type: "wow", emoji: "😮", label: "Wow" },
  { type: "sad", emoji: "😢", label: "Sad" },
  { type: "angry", emoji: "😡", label: "Angry" },
];

function reactionMeta(type: ReactionType | null) {
  return REACTIONS.find((r) => r.type === type) ?? null;
}

function formatCommentTime(value: string, lang: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return lang === "vi" ? "vừa xong" : "just now";
  if (diffMs < hour) {
    const n = Math.max(1, Math.floor(diffMs / minute));
    return lang === "vi" ? `${n} phút trước` : `${n}m ago`;
  }
  if (diffMs < day) {
    const n = Math.max(1, Math.floor(diffMs / hour));
    return lang === "vi" ? `${n} giờ trước` : `${n}h ago`;
  }
  if (diffMs < 7 * day) {
    const n = Math.max(1, Math.floor(diffMs / day));
    return lang === "vi" ? `${n} ngày trước` : `${n}d ago`;
  }
  return date.toLocaleDateString(lang === "vi" ? "vi-VN" : undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function PinDetail({ pin, currentUserId, currentUserName, onDelete, onUpdated, onFavoriteUpdated, onShowOnMap }: Props) {
  const { t, lang } = useI18n();
  const { getCategory } = useCategoriesCtx();
  const { updatePin } = usePinsCtx();
  const [deleting, setDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [sendingComment, setSendingComment] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteOverride, setFavoriteOverride] = useState<{
    pinId: string;
    value: boolean;
  } | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const longPressTimer = useRef<number | null>(null);
  const reactionWrapRef = useRef<HTMLDivElement | null>(null);
  const {
    reactions,
    reactionCount,
    myReaction,
    comments,
    loading: interactionsLoading,
    setReaction,
    addComment,
    updateComment,
    deleteComment,
  } = usePinInteractions(pin.id, currentUserId);

  const isMine = pin.created_by === currentUserId;
  // eslint-disable-next-line react-hooks/purity
  const ageMs = Date.now() - new Date(pin.created_at).getTime();
  const withinEditWindow = ageMs < EDIT_WINDOW_MS;
  const canEdit = isMine && withinEditWindow;
  const images = pin.images ?? [];

  const displayedFavorite =
    favoriteOverride?.pinId === pin.id ? favoriteOverride.value : pin.is_favorite;

  useEffect(() => {
    if (!reactionPickerOpen) return;
    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && reactionWrapRef.current?.contains(target)) return;
      setReactionPickerOpen(false);
    }
    window.addEventListener("pointerdown", handleOutsidePointer);
    return () => window.removeEventListener("pointerdown", handleOutsidePointer);
  }, [reactionPickerOpen]);

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

  async function toggleFavorite() {
    const nextFavorite = !displayedFavorite;
    setFavoriteBusy(true);
    setFavoriteOverride({ pinId: pin.id, value: nextFavorite });
    try {
      const updated = await updatePin(pin.id, { is_favorite: nextFavorite });
      setFavoriteOverride({ pinId: pin.id, value: updated.is_favorite });
      onFavoriteUpdated?.(updated);
    } catch (err) {
      setFavoriteOverride({ pinId: pin.id, value: !nextFavorite });
      setInteractionError(err instanceof Error ? err.message : String(err));
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function handleReaction(reaction: ReactionType) {
    setInteractionError(null);
    setReactionPickerOpen(false);
    try {
      await setReaction(reaction);
    } catch (err) {
      setInteractionError(err instanceof Error ? err.message : String(err));
    }
  }

  function startReactionPress() {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      setReactionPickerOpen(true);
      longPressTimer.current = null;
    }, 360);
  }

  function endReactionPress() {
    if (!longPressTimer.current) return;
    window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    void handleReaction(myReaction ? myReaction : "love");
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body) return;
    setSendingComment(true);
    setInteractionError(null);
    try {
      await addComment(body);
      setCommentText("");
    } catch (err) {
      setInteractionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingComment(false);
    }
  }

  async function handleDeleteComment(id: string) {
    setInteractionError(null);
    try {
      await deleteComment(id);
    } catch (err) {
      setInteractionError(err instanceof Error ? err.message : String(err));
    }
  }

  function startEditComment(id: string, body: string) {
    setEditingCommentId(id);
    setEditingCommentText(body);
  }

  async function handleSaveEditedComment(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCommentId || !editingCommentText.trim()) return;
    setInteractionError(null);
    try {
      await updateComment(editingCommentId, editingCommentText);
      setEditingCommentId(null);
      setEditingCommentText("");
    } catch (err) {
      setInteractionError(err instanceof Error ? err.message : String(err));
    }
  }

  function displayName(userId: string, authorName: string | null | undefined) {
    if (userId === currentUserId) return t("common.you");
    return authorName || t("common.partner");
  }

  function avatarInitial(userId: string, authorName: string | null | undefined) {
    const source = userId === currentUserId ? currentUserName : authorName;
    const trimmed = (source || displayName(userId, authorName)).trim();
    return (trimmed.match(/\p{L}/u)?.[0] ?? "?").toUpperCase();
  }

  const currentReaction = reactionMeta(myReaction);
  const reactionSummary = REACTIONS
    .filter((r) => reactions.some((item) => item.reaction === r.type))
    .slice(0, 3);

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
      <div className="pin-action-panel">
        <div className="pin-primary-actions">
          <div className="reaction-action-wrap" ref={reactionWrapRef}>
            {reactionPickerOpen && (
              <div className="reaction-picker" role="menu">
                {REACTIONS.map((reaction) => (
                  <button
                    key={reaction.type}
                    type="button"
                    className="reaction-picker-btn"
                    onClick={() => handleReaction(reaction.type)}
                    aria-label={reaction.label}
                  >
                    {reaction.emoji}
                  </button>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              className={`heart-action ${myReaction ? "active" : ""}`}
              onPointerDown={startReactionPress}
              onPointerUp={endReactionPress}
              onPointerLeave={() => {
                if (longPressTimer.current) {
                  window.clearTimeout(longPressTimer.current);
                  longPressTimer.current = null;
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setReactionPickerOpen(true);
              }}
            >
              {currentReaction ? (
                <span className="reaction-action-emoji">{currentReaction.emoji}</span>
              ) : (
                <Heart size={16} />
              )}
              {reactionCount > 0 ? reactionCount : t("pin.heart")}
            </Button>
          </div>
          <Button
            variant="secondary"
            className={`favorite-action ${displayedFavorite ? "active" : ""}`}
            onClick={toggleFavorite}
            disabled={favoriteBusy}
          >
            <Star size={16} fill={displayedFavorite ? "currentColor" : "none"} />
            {displayedFavorite ? t("pin.favorited") : t("pin.favorite")}
          </Button>
        </div>
        <div className="pin-utility-actions">
        {onShowOnMap && (
          <Button variant="secondary" className="pin-tool-btn" onClick={() => onShowOnMap(pin)} title={t("pin.showOnMap")}>
            <MapPin size={17} />
            <span>{t("pin.showOnMap")}</span>
          </Button>
        )}
        <Button variant="secondary" className="pin-tool-btn" onClick={openInMaps} title={t("pin.openMaps")}>
          <ExternalLink size={17} />
          <span>{t("pin.openMaps")}</span>
        </Button>
        <Button variant="secondary" className="pin-tool-btn" onClick={() => setShowShareCard(true)} title={t("share.card")}>
          <Image size={17} />
          <span>{t("share.card")}</span>
        </Button>
        <Button variant="secondary" className="pin-tool-btn" onClick={share} title={t("pin.share")}>
          <Share2 size={17} />
          <span>{t("pin.share")}</span>
        </Button>
        {canEdit && (
          <Button variant="secondary" className="pin-tool-btn" onClick={() => setEditing(true)} title={t("pin.edit")}>
            <Pencil size={17} />
            <span>{t("pin.edit")}</span>
          </Button>
        )}
        {isMine && (
          <Button variant="danger" className="pin-tool-btn danger" onClick={handleDelete} disabled={deleting} title={t("pin.delete")}>
            <Trash2 size={17} />
            <span>{deleting ? t("pin.deleting") : t("pin.delete")}</span>
          </Button>
        )}
        </div>
      </div>
      <div className="pin-interactions">
        {reactionCount > 0 && (
          <div className="reaction-summary">
            <span className="reaction-summary-icons">
              {reactionSummary.map((reaction) => (
                <span key={reaction.type}>{reaction.emoji}</span>
              ))}
            </span>
            <span>{reactionCount}</span>
          </div>
        )}
        <div className="pin-comments-head">
          <span>{t("pin.comments")}</span>
          <span className="muted small">
            {interactionsLoading ? t("pin.loadingComments") : `${comments.length}`}
          </span>
        </div>
        {interactionError && <p className="error small">{interactionError}</p>}
        <div className="pin-comments-list">
          {comments.length === 0 && !interactionsLoading ? (
            <p className="muted small pin-comments-empty">{t("pin.noComments")}</p>
          ) : (
            comments.map((comment) => {
              const mine = comment.user_id === currentUserId;
              return (
                <div key={comment.id} className="pin-comment">
                  <div className="pin-comment-avatar">
                    {avatarInitial(comment.user_id, comment.author?.display_name)}
                  </div>
                  <div className="pin-comment-main">
                    <div className="pin-comment-meta">
                      <strong>{displayName(comment.user_id, comment.author?.display_name)}</strong>
                      <span>{formatCommentTime(comment.created_at, lang)}</span>
                    </div>
                    {editingCommentId === comment.id ? (
                      <form className="pin-comment-edit-form" onSubmit={handleSaveEditedComment}>
                        <input
                          type="text"
                          value={editingCommentText}
                          onChange={(e) => setEditingCommentText(e.target.value)}
                          maxLength={500}
                          autoFocus
                        />
                        <div className="pin-comment-edit-actions">
                          <button type="submit" disabled={!editingCommentText.trim()}>
                            {t("common.save")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(null);
                              setEditingCommentText("");
                            }}
                          >
                            {t("common.cancel")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p>{comment.body}</p>
                    )}
                  </div>
                  {mine && (
                    <div className="pin-comment-tools">
                      <button
                        type="button"
                        className="pin-comment-icon-btn"
                        onClick={() => startEditComment(comment.id, comment.body)}
                        aria-label={t("pin.editComment")}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="pin-comment-icon-btn"
                        onClick={() => handleDeleteComment(comment.id)}
                        aria-label={t("pin.deleteComment")}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <form className="pin-comment-form" onSubmit={handleAddComment}>
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={t("pin.commentPlaceholder")}
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!commentText.trim() || sendingComment}
            aria-label={t("pin.sendComment")}
          >
            <Send size={16} />
          </button>
        </form>
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
