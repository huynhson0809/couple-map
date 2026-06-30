import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../hooks/I18nContext";
import { useSpaceCtx } from "../../hooks/SpaceContext";
import { useSubscription } from "../../hooks/useSubscription";
import type { Space } from "../../types";
import { Button } from "../ui/Button";
import { GlassSurface } from "../ui/GlassSurface";
import { cx } from "../ui/uiClasses";

const DELETE_SPACE_CONFIRM_TEXT = "XOA";

function quotaMessage(lang: string) {
  return lang === "vi"
    ? "Bạn đã đạt giới hạn bản đồ của gói hiện tại."
    : "You have reached your current plan's map limit.";
}

function formatSpaceError(err: unknown, lang: string) {
  if (err instanceof Error) {
    return err.message === "space_quota_reached"
      ? quotaMessage(lang)
      : err.message;
  }
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: unknown }).message);
    return message === "space_quota_reached" ? quotaMessage(lang) : message;
  }
  const message = String(err);
  return message === "space_quota_reached" ? quotaMessage(lang) : message;
}

export function SpaceSwitcher() {
  const { lang, t } = useI18n();
  const {
    profile,
    spaces,
    activeSpace,
    members,
    setActiveSpace,
    createPersonalSpace,
    deleteSpace,
  } = useSpaceCtx();
  const {
    canCreateSpace,
    loading: subscriptionLoading,
    refetch: refetchSubscription,
  } = useSubscription();
  const [busy, setBusy] = useState<"switch" | "create" | "delete" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Space | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const quotaReached = !subscriptionLoading && !canCreateSpace;
  const hasOnlyOneSpace = spaces.length <= 1;
  const canDeleteSpace = !hasOnlyOneSpace;
  const deleteConfirmValid =
    deleteConfirmText.trim().toUpperCase() === DELETE_SPACE_CONFIRM_TEXT;

  function activeMemberCount(spaceId: string) {
    return members.filter(
      (member) => member.space_id === spaceId && member.status === "active",
    ).length;
  }

  function isOwnedSpace(space: Space) {
    return profile?.id === space.owner_id;
  }

  function formatDeleteError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "space_delete_last_space") {
      return t("settings.deleteSpaceLastSpace");
    }
    if (message === "space_delete_owner_required") {
      return t("settings.deleteSpaceOwnerRequired");
    }
    return t("settings.deleteSpaceError");
  }

  async function handleSpaceChange(spaceId: string) {
    if (spaceId === activeSpace?.id || busy) return;
    setBusy("switch");
    setError(null);
    try {
      await setActiveSpace(spaceId);
    } catch (err) {
      setError(formatSpaceError(err, lang));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateSpace() {
    if (busy || quotaReached) return;
    setBusy("create");
    setError(null);
    try {
      await createPersonalSpace();
    } catch (err) {
      setError(formatSpaceError(err, lang));
    } finally {
      setBusy(null);
    }
  }

  function closeDeleteDialog() {
    if (busy === "delete") return;
    setDeleteTarget(null);
    setDeleteError(null);
    setDeleteConfirmText("");
  }

  async function handleDeleteSpace() {
    if (!deleteTarget || busy || !deleteConfirmValid) return;
    setBusy("delete");
    setDeleteError(null);
    try {
      const deletingActiveSpace = deleteTarget.id === activeSpace?.id;
      await deleteSpace(deleteTarget.id);
      if (!deletingActiveSpace) await refetchSubscription();
      setDeleteTarget(null);
      setDeleteConfirmText("");
    } catch (err) {
      setDeleteError(formatDeleteError(err));
    } finally {
      setBusy(null);
    }
  }

  const deleteDialog =
    deleteTarget && typeof document !== "undefined"
      ? createPortal(
          <div
            className="space-delete-overlay lg-overlay-backdrop"
            onClick={closeDeleteDialog}
          >
            <div
              className="space-delete-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="space-delete-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="space-delete-close"
                onClick={closeDeleteDialog}
                disabled={busy === "delete"}
                aria-label={t("common.cancel")}
              >
                <X size={18} aria-hidden="true" />
              </button>
              <div className="space-delete-icon">
                <Trash2 size={24} aria-hidden="true" />
              </div>
              <h3 id="space-delete-title">{t("settings.deleteSpaceTitle")}</h3>
              <p>
                <strong>{deleteTarget.name}</strong>
                <span>{t("settings.deleteSpaceBody")}</span>
              </p>
              <label className="space-delete-field">
                <span>{t("settings.deleteSpaceConfirmLabel")}</span>
                <input
                  value={deleteConfirmText}
                  onChange={(event) => {
                    setDeleteConfirmText(event.target.value);
                    if (deleteError) setDeleteError(null);
                  }}
                  placeholder={t("settings.deleteSpaceConfirmPlaceholder")}
                  autoCapitalize="characters"
                  autoComplete="off"
                  disabled={busy === "delete"}
                />
              </label>
              {!canDeleteSpace && (
                <p className="error small">
                  {t("settings.deleteSpaceLastSpace")}
                </p>
              )}
              {deleteError && <p className="error small">{deleteError}</p>}
              <div className="space-delete-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeDeleteDialog}
                  disabled={busy === "delete"}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => void handleDeleteSpace()}
                  disabled={
                    !canDeleteSpace || !deleteConfirmValid || busy === "delete"
                  }
                >
                  {busy === "delete"
                    ? t("settings.deleteSpaceDeleting")
                    : t("settings.deleteSpaceConfirm")}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <GlassSurface
        as="section"
        level="section"
        className="setting-section space-switcher"
      >
        <div className="setting-section-title">
          <span>{t("settings.space")}</span>
        </div>
        <div className="space-switcher-controls">
          {spaces.length > 0 && activeSpace && (
            <div
              className="space-switcher-list"
              role="list"
              aria-label={t("settings.space")}
            >
              {spaces.map((space) => {
                const active = space.id === activeSpace.id;
                const memberCount = activeMemberCount(space.id);
                const owned = isOwnedSpace(space);
                const deleteDisabled = hasOnlyOneSpace || busy !== null;
                return (
                  <div
                    key={space.id}
                    className={cx("space-switcher-card", active && "active")}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className={cx(
                        "space-switcher-option",
                        active && "active",
                      )}
                      aria-current={active ? "true" : undefined}
                      disabled={busy !== null}
                      onClick={() => void handleSpaceChange(space.id)}
                    >
                      <span className="space-switcher-name">{space.name}</span>
                      <span className="space-switcher-meta">
                        {space.type === "personal"
                          ? t("settings.spacePersonal")
                          : t("settings.spaceShared")}
                        {" · "}
                        {memberCount}/2
                      </span>
                    </button>
                    {owned && (
                      <button
                        type="button"
                        className="space-switcher-delete"
                        aria-label={t("settings.deleteSpace")}
                        title={
                          canDeleteSpace
                            ? t("settings.deleteSpace")
                            : t("settings.deleteSpaceLastSpace")
                        }
                        disabled={deleteDisabled}
                        onClick={() => {
                          setError(null);
                          setDeleteError(null);
                          setDeleteConfirmText("");
                          setDeleteTarget(space);
                        }}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleCreateSpace()}
            loading={busy === "create"}
            disabled={quotaReached || busy !== null}
            leadingIcon={<Plus size={16} />}
            className="space-switcher-create"
          >
            {t("settings.createSpace")}
          </Button>
        </div>
        {quotaReached && (
          <p className="space-quota-note">{quotaMessage(lang)}</p>
        )}
        {error && <p className="error small">{error}</p>}
      </GlassSurface>
      {deleteDialog}
    </>
  );
}
