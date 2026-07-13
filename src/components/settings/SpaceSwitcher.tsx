import { Check, Clock3, LockKeyhole, LogIn, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
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
    ? "Bạn đã đạt giới hạn tạo bản đồ. Bạn vẫn có thể tham gia bản đồ được mời."
    : "You have reached your map creation limit. You can still join maps you are invited to.";
}

function formatSpaceError(err: unknown, lang: string) {
  if (err instanceof Error) {
    if (err.message === "space_quota_reached") return quotaMessage(lang);
    if (err.message === "space_read_only") {
      return lang === "vi"
        ? "Bản đồ này đang ở chế độ chỉ xem. Hãy nâng cấp gói để tiếp tục chỉnh sửa."
        : "This map is read-only. Upgrade your plan to keep editing.";
    }
    return err.message;
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
    joinSpaceByInvite,
    deleteSpace,
  } = useSpaceCtx();
  const {
    canCreateSpace,
    ownedSpaceLimit,
    spaceQuotaOverLimit,
    spaceQuotaGraceActive,
    spaceQuotaGraceEndsAt,
    spaceQuotaSelectedIds,
    spaceQuotaRestrictedIds,
    currentSpaceWritable,
    saveSpaceQuotaSelection,
    loading: subscriptionLoading,
    refetch: refetchSubscription,
  } = useSubscription();
  const [busy, setBusy] = useState<
    "switch" | "create" | "join" | "delete" | "quota" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Space | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [quotaSelectionState, setQuotaSelectionState] = useState<{
    sourceKey: string;
    ids: string[];
  }>({ sourceKey: "", ids: [] });
  const quotaReached = !subscriptionLoading && !canCreateSpace;
  const hasOnlyOneSpace = spaces.length <= 1;
  const canDeleteSpace = !hasOnlyOneSpace;
  const deleteConfirmValid =
    deleteConfirmText.trim().toUpperCase() === DELETE_SPACE_CONFIRM_TEXT;
  const ownedSpaces = useMemo(
    () => spaces.filter((space) => space.owner_id === profile?.id),
    [profile?.id, spaces],
  );
  const restrictedSpaceIds = useMemo(
    () => new Set(spaceQuotaRestrictedIds),
    [spaceQuotaRestrictedIds],
  );
  const savedSelectionKey = [...spaceQuotaSelectedIds].sort().join(":");
  const quotaSelectionSourceKey = `${spaceQuotaOverLimit}:${ownedSpaceLimit}:${savedSelectionKey}`;
  const suggestedQuotaSelection = [
    ...(activeSpace && activeSpace.owner_id === profile?.id
      ? [activeSpace.id]
      : []),
    ...ownedSpaces.map((space) => space.id),
  ];
  const quotaSelection = !spaceQuotaOverLimit
    ? []
    : quotaSelectionState.sourceKey === quotaSelectionSourceKey
      ? quotaSelectionState.ids
      : spaceQuotaSelectedIds.length > 0
        ? spaceQuotaSelectedIds
        : Array.from(new Set(suggestedQuotaSelection)).slice(
            0,
            ownedSpaceLimit,
          );
  const quotaSelectionKey = [...quotaSelection].sort().join(":");
  const quotaSelectionValid = quotaSelection.length === ownedSpaceLimit;
  const quotaSelectionChanged = quotaSelectionKey !== savedSelectionKey;

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

  async function handleJoinSpaceByInvite(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !joinInviteCode.trim()) return;
    setBusy("join");
    setError(null);
    setJoinSuccess(false);
    try {
      await joinSpaceByInvite(joinInviteCode);
      setJoinInviteCode("");
      setJoinSuccess(true);
      await refetchSubscription();
    } catch (err) {
      setError(formatSpaceError(err, lang));
    } finally {
      setBusy(null);
    }
  }

  function toggleQuotaSpace(spaceId: string) {
    if (!spaceQuotaGraceActive || busy) return;
    setError(null);
    setQuotaSelectionState(() => {
      const current = quotaSelection;
      if (current.includes(spaceId)) {
        return {
          sourceKey: quotaSelectionSourceKey,
          ids: current.filter((id) => id !== spaceId),
        };
      }
      if (current.length >= ownedSpaceLimit) {
        return { sourceKey: quotaSelectionSourceKey, ids: current };
      }
      return {
        sourceKey: quotaSelectionSourceKey,
        ids: [...current, spaceId],
      };
    });
  }

  async function handleSaveQuotaSelection() {
    if (
      busy ||
      !spaceQuotaGraceActive ||
      !quotaSelectionValid ||
      !quotaSelectionChanged
    ) {
      return;
    }
    setBusy("quota");
    setError(null);
    try {
      await saveSpaceQuotaSelection(quotaSelection);
    } catch (err) {
      setError(formatSpaceError(err, lang));
    } finally {
      setBusy(null);
    }
  }

  function quotaDeadline() {
    if (!spaceQuotaGraceEndsAt) return "";
    return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(spaceQuotaGraceEndsAt));
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
        {spaceQuotaOverLimit && (
          <div
            className={cx(
              "space-quota-panel",
              spaceQuotaGraceActive ? "grace" : "restricted",
            )}
          >
            <div className="space-quota-panel-icon" aria-hidden="true">
              {spaceQuotaGraceActive ? (
                <Clock3 size={18} />
              ) : (
                <LockKeyhole size={18} />
              )}
            </div>
            <div className="space-quota-panel-copy">
              <strong>
                {spaceQuotaGraceActive
                  ? t("settings.spaceQuotaGraceTitle")
                  : t("settings.spaceQuotaReadOnlyTitle")}
              </strong>
              <p>
                {spaceQuotaGraceActive
                  ? t("settings.spaceQuotaGraceBody", {
                      limit: String(ownedSpaceLimit),
                    })
                  : t("settings.spaceQuotaReadOnlyBody")}
              </p>
              {spaceQuotaGraceActive && (
                <span className="space-quota-deadline">
                  {t("settings.spaceQuotaDeadline", {
                    date: quotaDeadline(),
                  })}
                </span>
              )}
            </div>
            {spaceQuotaGraceActive && (
              <div className="space-quota-panel-actions">
                <span>
                  {quotaSelection.length}/{ownedSpaceLimit}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={busy === "quota"}
                  disabled={
                    busy !== null ||
                    !quotaSelectionValid ||
                    !quotaSelectionChanged
                  }
                  onClick={() => void handleSaveQuotaSelection()}
                >
                  {quotaSelectionChanged
                    ? t("settings.spaceQuotaSave")
                    : t("settings.spaceQuotaSaved")}
                </Button>
              </div>
            )}
          </div>
        )}
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
                const quotaSelected = quotaSelection.includes(space.id);
                const readOnly =
                  restrictedSpaceIds.has(space.id) ||
                  (active && !currentSpaceWritable);
                const selectable =
                  owned && spaceQuotaOverLimit && spaceQuotaGraceActive;
                const deleteDisabled = hasOnlyOneSpace || busy !== null;
                return (
                  <div
                    key={space.id}
                    className={cx(
                      "space-switcher-card",
                      active && "active",
                      readOnly && "read-only",
                      selectable && quotaSelected && "quota-selected",
                    )}
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
                      {readOnly && (
                        <span className="space-switcher-access read-only">
                          <LockKeyhole size={12} aria-hidden="true" />
                          {t("settings.spaceReadOnly")}
                        </span>
                      )}
                      {selectable && (
                        <span className="space-switcher-access">
                          {quotaSelected
                            ? t("settings.spaceKeepEditable")
                            : t("settings.spaceWillReadOnly")}
                        </span>
                      )}
                    </button>
                    {selectable && (
                      <button
                        type="button"
                        className={cx(
                          "space-quota-select",
                          quotaSelected && "selected",
                        )}
                        aria-label={
                          quotaSelected
                            ? t("settings.spaceRemoveSelection", {
                                name: space.name,
                              })
                            : t("settings.spaceAddSelection", {
                                name: space.name,
                              })
                        }
                        aria-pressed={quotaSelected}
                        disabled={
                          busy !== null ||
                          (!quotaSelected &&
                            quotaSelection.length >= ownedSpaceLimit)
                        }
                        onClick={() => toggleQuotaSpace(space.id)}
                      >
                        {quotaSelected && <Check size={15} aria-hidden="true" />}
                      </button>
                    )}
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
          <form
            className="space-join-form"
            onSubmit={(event) => void handleJoinSpaceByInvite(event)}
          >
            <label className="space-join-label" htmlFor="settings-space-join-code">
              {t("settings.joinSpace")}
            </label>
            <div className="space-join-row">
              <input
                id="settings-space-join-code"
                className="space-join-input"
                value={joinInviteCode}
                onChange={(event) => {
                  setJoinInviteCode(event.target.value.toUpperCase());
                  setJoinSuccess(false);
                  if (error) setError(null);
                }}
                placeholder={t("spaceSetup.inviteCode")}
                maxLength={12}
                autoComplete="off"
                disabled={busy !== null && busy !== "join"}
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                loading={busy === "join"}
                disabled={
                  (busy !== null && busy !== "join") || !joinInviteCode.trim()
                }
                leadingIcon={<LogIn size={15} />}
                className="space-join-submit"
              >
                {t("spaceSetup.join")}
              </Button>
            </div>
            <p className="space-join-hint">{t("settings.joinSpaceHint")}</p>
          </form>
        </div>
        {quotaReached && !spaceQuotaOverLimit && (
          <p className="space-quota-note">{quotaMessage(lang)}</p>
        )}
        {joinSuccess && (
          <p className="space-join-success">{t("settings.joinSpaceSuccess")}</p>
        )}
        {error && <p className="error small">{error}</p>}
      </GlassSurface>
      {deleteDialog}
    </>
  );
}
