import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  MoreHorizontal,
} from "lucide-react";
import type { Pin } from "../../types";
import {
  getImageUrl,
  isVideoUrl,
  getVideoUrl,
  getVideoThumbnailUrl,
} from "../../lib/cloudinary";
import { Button } from "../ui/Button";
import { ImageLightbox } from "../ui/ImageLightbox";
import { EditPinForm } from "./EditPinForm";
import { ShareCard } from "../share/ShareCard";
import { useI18n } from "../../hooks/I18nContext";
import { useCategoriesCtx } from "../../hooks/CategoriesContext";
import { usePinInteractions } from "../../hooks/usePinInteractions";
import { usePinsCtx } from "../../hooks/PinsContext";
import type { ReactionType } from "../../types";
import { useToast } from "../../hooks/ToastContext";
import { resolvePinCategories } from "../../lib/pinCategories";

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
const COMMENT_COMPOSER_ACTIVE_CLASS = "pin-comment-composer-active";
const COMMENT_COMPOSER_LAYER_RELEASE_MS = 720;
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
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function setCommentComposerLayerMode(active: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(COMMENT_COMPOSER_ACTIVE_CLASS, active);
}

export function PinDetail({
  pin,
  currentUserId,
  currentUserName,
  onDelete,
  onUpdated,
  onFavoriteUpdated,
  onShowOnMap,
}: Props) {
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const { allCategories } = useCategoriesCtx();
  const { updatePin, fetchPinImages } = usePinsCtx();
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
  const [commentMenuOpenId, setCommentMenuOpenId] = useState<string | null>(
    null,
  );
  const [commentReactionPickerOpenId, setCommentReactionPickerOpenId] =
    useState<string | null>(null);
  const [replyingToComment, setReplyingToComment] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [pinActionMenuOpen, setPinActionMenuOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const commentLongPressTimer = useRef<number | null>(null);
  const commentComposerReleasePending = useRef<boolean>(false);
  const commentComposerReleaseTimer = useRef<number | null>(null);
  const reactionWrapRef = useRef<HTMLDivElement | null>(null);
  const {
    reactions,
    reactionCount,
    myReaction,
    comments,
    commentReactions,
    loading: interactionsLoading,
    setReaction,
    addComment,
    updateComment,
    deleteComment,
    setCommentReaction,
  } = usePinInteractions(pin.id, currentUserId);

  const isMine = pin.created_by === currentUserId;
  // eslint-disable-next-line react-hooks/purity
  const ageMs = Date.now() - new Date(pin.created_at).getTime();
  const withinEditWindow = ageMs < EDIT_WINDOW_MS;
  const canEdit = isMine && withinEditWindow;
  const images = useMemo(() => pin.images ?? [], [pin.images]);
  const [fullImagesLoaded, setFullImagesLoaded] = useState(false);

  // Lazy-load full image details (width, height, public_id) when pin detail opens
  useEffect(() => {
    if (!fullImagesLoaded && pin.id) {
      fetchPinImages(pin.id).then(() => setFullImagesLoaded(true));
    }
  }, [pin.id, fullImagesLoaded, fetchPinImages]);

  const photoImages = useMemo(
    () => images.filter((img) => !isVideoUrl(img.cloudinary_url)),
    [images],
  );

  const displayedFavorite =
    favoriteOverride?.pinId === pin.id
      ? favoriteOverride.value
      : pin.is_favorite;
  const resolvedCategories = useMemo(
    () => resolvePinCategories(pin, allCategories),
    [allCategories, pin],
  );

  useEffect(() => {
    if (!reactionPickerOpen) return;
    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && reactionWrapRef.current?.contains(target)) return;
      setReactionPickerOpen(false);
    }
    window.addEventListener("pointerdown", handleOutsidePointer);
    return () =>
      window.removeEventListener("pointerdown", handleOutsidePointer);
  }, [reactionPickerOpen]);

  useEffect(() => {
    if (!commentMenuOpenId) return;
    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-comment-actions]")) return;
      setCommentMenuOpenId(null);
    }
    window.addEventListener("pointerdown", handleOutsidePointer);
    return () =>
      window.removeEventListener("pointerdown", handleOutsidePointer);
  }, [commentMenuOpenId]);

  useEffect(() => {
    if (!commentReactionPickerOpenId) return;
    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-comment-reaction-picker]")) return;
      setCommentReactionPickerOpenId(null);
    }
    window.addEventListener("pointerdown", handleOutsidePointer);
    return () =>
      window.removeEventListener("pointerdown", handleOutsidePointer);
  }, [commentReactionPickerOpenId]);

  useEffect(() => {
    if (!pinActionMenuOpen) return;
    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-pin-actions]")) return;
      setPinActionMenuOpen(false);
    }
    window.addEventListener("pointerdown", handleOutsidePointer);
    return () =>
      window.removeEventListener("pointerdown", handleOutsidePointer);
  }, [pinActionMenuOpen]);

  const clearCommentComposerLayerRelease = useCallback(() => {
    if (commentComposerReleaseTimer.current !== null) {
      window.clearTimeout(commentComposerReleaseTimer.current);
    }
    commentComposerReleaseTimer.current = null;
    commentComposerReleasePending.current = false;
  }, []);

  const releaseCommentComposerLayerMode = useCallback(() => {
    commentComposerReleaseTimer.current = null;
    commentComposerReleasePending.current = false;
    setCommentComposerLayerMode(false);
  }, []);

  const scheduleCommentComposerLayerRelease = useCallback(() => {
    clearCommentComposerLayerRelease();
    commentComposerReleasePending.current = true;
    commentComposerReleaseTimer.current = window.setTimeout(
      releaseCommentComposerLayerMode,
      COMMENT_COMPOSER_LAYER_RELEASE_MS,
    );
  }, [clearCommentComposerLayerRelease, releaseCommentComposerLayerMode]);

  function enableCommentComposerLayerMode() {
    clearCommentComposerLayerRelease();
    setCommentComposerLayerMode(true);
  }

  useEffect(() => {
    return () => {
      clearCommentComposerLayerRelease();
      setCommentComposerLayerMode(false);
    };
  }, [clearCommentComposerLayerRelease]);

  useEffect(() => {
    function handleCommentComposerViewportChange() {
      if (!commentComposerReleasePending.current) return;
      scheduleCommentComposerLayerRelease();
    }

    window.visualViewport?.addEventListener(
      "resize",
      handleCommentComposerViewportChange,
    );
    window.visualViewport?.addEventListener(
      "scroll",
      handleCommentComposerViewportChange,
    );
    return () => {
      window.visualViewport?.removeEventListener(
        "resize",
        handleCommentComposerViewportChange,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        handleCommentComposerViewportChange,
      );
    };
  }, [scheduleCommentComposerLayerRelease]);

  function handleCommentComposerPointerDown() {
    enableCommentComposerLayerMode();
  }

  function handleCommentComposerFocus() {
    enableCommentComposerLayerMode();
  }

  function handleCommentComposerBlur() {
    scheduleCommentComposerLayerRelease();
  }

  async function handleDelete() {
    if (!confirm(t("pin.deleteConfirm"))) return;
    setPinActionMenuOpen(false);
    setDeleting(true);
    try {
      await onDelete(pin.id);
      showToast({ type: "success", title: t("toast.memoryDeleted") });
    } catch (err) {
      setInteractionError(err instanceof Error ? err.message : String(err));
      showToast({ type: "error", title: t("toast.actionFailed") });
    } finally {
      setDeleting(false);
    }
  }

  function openInMaps() {
    setPinActionMenuOpen(false);
    const url = `https://www.google.com/maps?q=${pin.lat},${pin.lng}`;
    window.open(url, "_blank");
  }

  async function share() {
    setPinActionMenuOpen(false);
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
      showToast({
        type: "success",
        title: updated.is_favorite
          ? t("toast.favoriteAdded")
          : t("toast.favoriteRemoved"),
      });
    } catch (err) {
      setFavoriteOverride({ pinId: pin.id, value: !nextFavorite });
      setInteractionError(err instanceof Error ? err.message : String(err));
      showToast({ type: "error", title: t("toast.actionFailed") });
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

  function startReactionPress(event?: React.PointerEvent<HTMLButtonElement>) {
    event?.preventDefault();
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      setReactionPickerOpen(true);
      longPressTimer.current = null;
    }, 360);
  }

  function endReactionPress(event?: React.PointerEvent<HTMLButtonElement>) {
    event?.preventDefault();
    if (!longPressTimer.current) return;
    window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    void handleReaction(myReaction ? myReaction : "love");
  }

  function clearCommentReactionPress() {
    if (!commentLongPressTimer.current) return;
    window.clearTimeout(commentLongPressTimer.current);
    commentLongPressTimer.current = null;
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body) return;
    setSendingComment(true);
    setInteractionError(null);
    try {
      await addComment(body, replyingToComment?.id ?? null);
      setCommentText("");
      setReplyingToComment(null);
      showToast({ type: "success", title: t("toast.commentAdded") });
    } catch (err) {
      setInteractionError(err instanceof Error ? err.message : String(err));
      showToast({ type: "error", title: t("toast.actionFailed") });
    } finally {
      setSendingComment(false);
    }
  }

  async function handleDeleteComment(id: string) {
    setInteractionError(null);
    setCommentMenuOpenId(null);
    try {
      await deleteComment(id);
      showToast({ type: "success", title: t("toast.commentDeleted") });
    } catch (err) {
      setInteractionError(err instanceof Error ? err.message : String(err));
      showToast({ type: "error", title: t("toast.actionFailed") });
    }
  }

  function startEditComment(id: string, body: string) {
    setCommentMenuOpenId(null);
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
      showToast({ type: "success", title: t("toast.commentUpdated") });
    } catch (err) {
      setInteractionError(err instanceof Error ? err.message : String(err));
      showToast({ type: "error", title: t("toast.actionFailed") });
    }
  }

  async function handleCommentReaction(
    commentId: string,
    reaction: ReactionType,
  ) {
    setInteractionError(null);
    setCommentReactionPickerOpenId(null);
    try {
      await setCommentReaction(commentId, reaction);
    } catch (err) {
      setInteractionError(err instanceof Error ? err.message : String(err));
      showToast({ type: "error", title: t("toast.actionFailed") });
    }
  }

  function startCommentReactionPress(
    commentId: string,
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    clearCommentReactionPress();
    commentLongPressTimer.current = window.setTimeout(() => {
      setCommentReactionPickerOpenId(commentId);
      commentLongPressTimer.current = null;
    }, 360);
  }

  function endCommentReactionPress(
    commentId: string,
    reaction: ReactionType,
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    if (!commentLongPressTimer.current) return;
    window.clearTimeout(commentLongPressTimer.current);
    commentLongPressTimer.current = null;
    void handleCommentReaction(commentId, reaction);
  }

  function displayName(userId: string, authorName: string | null | undefined) {
    if (userId === currentUserId) return t("common.you");
    return authorName || t("common.partner");
  }

  function avatarInitial(
    userId: string,
    authorName: string | null | undefined,
  ) {
    const source = userId === currentUserId ? currentUserName : authorName;
    const trimmed = (source || displayName(userId, authorName)).trim();
    return (trimmed.match(/\p{L}/u)?.[0] ?? "?").toUpperCase();
  }

  function startReply(
    commentId: string,
    parentCommentId: string | null,
    userId: string,
    authorName: string | null | undefined,
  ) {
    // Always reply to the top-level comment (keep threads flat)
    const topLevelId = parentCommentId ?? commentId;
    setReplyingToComment({
      id: topLevelId,
      name: displayName(userId, authorName),
    });
  }

  function openPhotoLightbox(imageId: string) {
    const index = photoImages.findIndex((photo) => photo.id === imageId);
    if (index >= 0) setLightboxIndex(index);
  }

  const currentReaction = reactionMeta(myReaction);
  const reactionSummary = REACTIONS.filter((r) =>
    reactions.some((item) => item.reaction === r.type),
  ).slice(0, 3);
  const reactionSummaryForLayout =
    reactionCount > 0 ? reactionSummary : [REACTIONS[1]];
  const topLevelComments = useMemo(
    () => comments.filter((comment) => !comment.parent_comment_id),
    [comments],
  );
  const repliesByComment = useMemo(() => {
    const map = new Map<string, typeof comments>();
    comments.forEach((comment) => {
      if (!comment.parent_comment_id) return;
      const replies = map.get(comment.parent_comment_id) ?? [];
      replies.push(comment);
      map.set(comment.parent_comment_id, replies);
    });
    return map;
  }, [comments]);

  function commentReactionCount(commentId: string) {
    return commentReactions.filter((item) => item.comment_id === commentId)
      .length;
  }

  function myCommentReaction(commentId: string) {
    return (
      commentReactions.find(
        (item) =>
          item.comment_id === commentId && item.user_id === currentUserId,
      )?.reaction ?? null
    );
  }

  function commentReactionSummary(commentId: string) {
    return REACTIONS.filter((reaction) =>
      commentReactions.some(
        (item) =>
          item.comment_id === commentId && item.reaction === reaction.type,
      ),
    ).slice(0, 3);
  }

  function renderComment(comment: (typeof comments)[number], isReply = false) {
    const mine = comment.user_id === currentUserId;
    const count = commentReactionCount(comment.id);
    const myCommentReactionType = myCommentReaction(comment.id);
    const currentCommentReaction = reactionMeta(myCommentReactionType);
    const commentSummary = commentReactionSummary(comment.id);

    return (
      <div key={comment.id} className={`pin-comment ${isReply ? "reply" : ""}`}>
        <div className="pin-comment-avatar">
          {avatarInitial(comment.user_id, comment.author?.display_name)}
        </div>
        <div className="pin-comment-main">
          <div className="pin-comment-meta">
            <strong>
              {displayName(comment.user_id, comment.author?.display_name)}
            </strong>
            <span>{formatCommentTime(comment.created_at, lang)}</span>
          </div>
          {editingCommentId === comment.id ? (
            <form
              className="pin-comment-edit-form"
              onSubmit={handleSaveEditedComment}
            >
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
            <>
              <p>{comment.body}</p>
              <div className="pin-comment-inline-actions">
                <div
                  className="pin-comment-reaction-wrap"
                  data-comment-reaction-picker
                >
                  {commentReactionPickerOpenId === comment.id && (
                    <div
                      className="reaction-picker comment-reaction-picker"
                      role="menu"
                    >
                      {REACTIONS.map((reaction) => (
                        <button
                          key={reaction.type}
                          type="button"
                          className="reaction-picker-btn"
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() =>
                            handleCommentReaction(comment.id, reaction.type)
                          }
                          aria-label={reaction.label}
                        >
                          {reaction.emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`pin-comment-reaction-btn ${myCommentReactionType ? "active" : ""}`}
                    onPointerDown={(e) =>
                      startCommentReactionPress(comment.id, e)
                    }
                    onPointerUp={(e) =>
                      endCommentReactionPress(
                        comment.id,
                        myCommentReactionType ? myCommentReactionType : "love",
                        e,
                      )
                    }
                    onPointerCancel={clearCommentReactionPress}
                    onPointerLeave={clearCommentReactionPress}
                    onClick={(e) => {
                      e.preventDefault();
                      if (e.detail === 0) {
                        void handleCommentReaction(
                          comment.id,
                          myCommentReactionType
                            ? myCommentReactionType
                            : "love",
                        );
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCommentReactionPickerOpenId(comment.id);
                    }}
                    aria-expanded={commentReactionPickerOpenId === comment.id}
                  >
                    {currentCommentReaction ? (
                      <span className="pin-comment-reaction-emoji">
                        {currentCommentReaction.emoji}
                      </span>
                    ) : commentSummary.length > 0 ? (
                      <span className="pin-comment-reaction-stack">
                        {commentSummary.map((reaction) => (
                          <span key={reaction.type}>{reaction.emoji}</span>
                        ))}
                      </span>
                    ) : (
                      <Heart size={12} />
                    )}
                    <span>{count > 0 ? count : t("pin.react")}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    startReply(
                      comment.id,
                      comment.parent_comment_id,
                      comment.user_id,
                      comment.author?.display_name,
                    )
                  }
                >
                  {t("pin.reply")}
                </button>
              </div>
            </>
          )}
        </div>
        {mine && editingCommentId !== comment.id && (
          <div className="pin-comment-actions" data-comment-actions>
            <button
              type="button"
              className="pin-comment-menu-button"
              onClick={() =>
                setCommentMenuOpenId((openId) =>
                  openId === comment.id ? null : comment.id,
                )
              }
              aria-label={t("pin.commentActions")}
              aria-expanded={commentMenuOpenId === comment.id}
            >
              <MoreHorizontal size={16} />
            </button>
            {commentMenuOpenId === comment.id && (
              <div className="pin-comment-menu">
                <button
                  type="button"
                  onClick={() => startEditComment(comment.id, comment.body)}
                >
                  <Pencil size={13} />
                  <span>{t("pin.edit")}</span>
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => handleDeleteComment(comment.id)}
                >
                  <Trash2 size={13} />
                  <span>{t("pin.delete")}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
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
          {images.map((img) =>
            isVideoUrl(img.cloudinary_url) ? (
              <div key={img.id} className="image-strip-item video-item">
                <video
                  src={getVideoUrl(img.cloudinary_url)}
                  poster={getVideoThumbnailUrl(img.cloudinary_url, 720)}
                  controls
                  playsInline
                  preload="metadata"
                />
              </div>
            ) : (
              <button
                key={img.id}
                type="button"
                className="image-strip-item"
                onClick={() => openPhotoLightbox(img.id)}
                aria-label="View full image"
              >
                <img src={getImageUrl(img.cloudinary_url, 800)} alt="" />
              </button>
            ),
          )}
        </div>
      )}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={photoImages.map((img) => ({
            id: img.id,
            url: getImageUrl(img.cloudinary_url, 1600, 90),
          }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      <div className="pin-detail-body">
        {resolvedCategories.length > 0 && (
          <div className="category-badge-row">
            {resolvedCategories.map((cat) => (
              <span
                key={cat.id}
                className="category-badge"
                style={{ background: `${cat.color}1a`, color: cat.color }}
              >
                <span>{cat.emoji}</span> {cat.label}
              </span>
            ))}
          </div>
        )}
        <div className="pin-heading-row">
          <h2 className="pin-title">{pin.title}</h2>
          <div className="pin-more-actions" data-pin-actions>
            <button
              type="button"
              className="pin-more-action-button"
              onClick={() => setPinActionMenuOpen((open) => !open)}
              aria-label={t("pin.moreActions")}
              aria-expanded={pinActionMenuOpen}
            >
              <MoreHorizontal size={18} />
            </button>
            {pinActionMenuOpen && (
              <div className="pin-action-menu">
                <button type="button" onClick={openInMaps}>
                  <ExternalLink size={14} />
                  <span>{t("pin.openMaps")}</span>
                </button>
                <button type="button" onClick={share}>
                  <Share2 size={14} />
                  <span>{t("pin.share")}</span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setPinActionMenuOpen(false);
                      setEditing(true);
                    }}
                  >
                    <Pencil size={14} />
                    <span>{t("pin.edit")}</span>
                  </button>
                )}
                {isMine && (
                  <button
                    type="button"
                    className="danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    <Trash2 size={14} />
                    <span>
                      {deleting ? t("pin.deleting") : t("pin.delete")}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
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
                    onPointerDown={(e) => e.preventDefault()}
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
              className={`heart-action pin-core-action ${myReaction ? "active" : ""}`}
              leadingIcon={
                currentReaction ? (
                  <span className="reaction-action-emoji">
                    {currentReaction.emoji}
                  </span>
                ) : (
                  <Heart size={16} />
                )
              }
              onPointerDown={startReactionPress}
              onPointerUp={endReactionPress}
              onPointerCancel={() => {
                if (longPressTimer.current) {
                  window.clearTimeout(longPressTimer.current);
                  longPressTimer.current = null;
                }
              }}
              onPointerLeave={() => {
                if (longPressTimer.current) {
                  window.clearTimeout(longPressTimer.current);
                  longPressTimer.current = null;
                }
              }}
              onSelect={(e) => e.preventDefault()}
              onContextMenu={(e) => {
                e.preventDefault();
                setReactionPickerOpen(true);
              }}
            >
              {reactionCount > 0 ? reactionCount : t("pin.heart")}
            </Button>
          </div>
          <Button
            variant="secondary"
            className={`favorite-action pin-core-action ${displayedFavorite ? "active" : ""}`}
            leadingIcon={
              <Star
                size={16}
                fill={displayedFavorite ? "currentColor" : "none"}
              />
            }
            onClick={toggleFavorite}
            disabled={favoriteBusy}
          >
            {displayedFavorite ? t("pin.favorited") : t("pin.favorite")}
          </Button>
          {onShowOnMap && (
            <Button
              variant="secondary"
              className="pin-core-action"
              leadingIcon={<MapPin size={17} />}
              onClick={() => onShowOnMap(pin)}
              title={t("pin.showOnMap")}
            >
              {t("pin.showOnMap")}
            </Button>
          )}
          <Button
            variant="secondary"
            className="pin-core-action"
            leadingIcon={<Image size={17} />}
            onClick={() => setShowShareCard(true)}
            title={t("share.card")}
          >
            {t("share.card")}
          </Button>
        </div>
      </div>
      <div className="pin-interactions">
        <div
          className={`reaction-summary ${reactionCount === 0 ? "empty" : ""}`}
          aria-hidden={reactionCount === 0}
        >
          <span className="reaction-summary-icons">
            {reactionSummaryForLayout.map((reaction) => (
              <span key={reaction.type}>{reaction.emoji}</span>
            ))}
          </span>
          <span>{reactionCount > 0 ? reactionCount : 1}</span>
        </div>
        <div className="pin-comments-head">
          <span>{t("pin.comments")}</span>
          <span className="muted small">
            {interactionsLoading
              ? t("pin.loadingComments")
              : `${comments.length}`}
          </span>
        </div>
        {interactionError && <p className="error small">{interactionError}</p>}
        <div className="pin-comments-list">
          {topLevelComments.length === 0 && !interactionsLoading ? (
            <p className="muted small pin-comments-empty">
              {t("pin.noComments")}
            </p>
          ) : (
            topLevelComments.map((comment) => (
              <div key={comment.id} className="pin-comment-thread">
                {renderComment(comment)}
                {(repliesByComment.get(comment.id) ?? []).map((reply) =>
                  renderComment(reply, true),
                )}
              </div>
            ))
          )}
        </div>
        {replyingToComment && (
          <div className="pin-comment-replying">
            <span>
              {t("pin.replyingTo")} <strong>{replyingToComment.name}</strong>
            </span>
            <button type="button" onClick={() => setReplyingToComment(null)}>
              {t("common.cancel")}
            </button>
          </div>
        )}
        <form className="pin-comment-form" onSubmit={handleAddComment}>
          <textarea
            rows={1}
            wrap="off"
            value={commentText}
            onChange={(e) =>
              setCommentText(e.target.value.replace(/[\r\n]+/g, " "))
            }
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) {
                return;
              }
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }}
            placeholder={t("pin.commentPlaceholder")}
            maxLength={500}
            enterKeyHint="send"
            onPointerDown={handleCommentComposerPointerDown}
            onFocus={handleCommentComposerFocus}
            onBlur={handleCommentComposerBlur}
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
