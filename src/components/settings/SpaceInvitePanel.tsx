import { UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/I18nContext";
import { useSpaceCtx } from "../../hooks/SpaceContext";
import type { Space } from "../../types";
import { Button } from "../ui/Button";
import { GlassSurface } from "../ui/GlassSurface";

function formatSpaceError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export function SpaceInvitePanel() {
  const { activeSpace, capabilities, createOrGetInvite } = useSpaceCtx();

  if (!activeSpace || !capabilities.canInviteInCurrentUi) return null;

  return (
    <SpaceInvitePanelContent
      key={activeSpace.id}
      activeSpace={activeSpace}
      createOrGetInvite={createOrGetInvite}
    />
  );
}

function SpaceInvitePanelContent({
  activeSpace,
  createOrGetInvite,
}: {
  activeSpace: Space;
  createOrGetInvite: (spaceId: string) => Promise<string>;
}) {
  const { t } = useI18n();
  const [inviteCode, setInviteCode] = useState<string | null>(activeSpace.invite_code ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeSpaceIdRef = useRef(activeSpace.id);
  const mountedRef = useRef(true);
  const copyTimerRef = useRef<number | null>(null);

  const clearCopyTimer = useCallback(() => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      mountedRef.current = false;
      clearCopyTimer();
    },
    [clearCopyTimer],
  );

  const requiresShareConfirmation =
    activeSpace.type === "personal" && inviteCode === null;

  async function revealInvite() {
    if (!activeSpace || busy) return;
    const targetSpaceId = activeSpace.id;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const code = await createOrGetInvite(targetSpaceId);
      if (
        !mountedRef.current ||
        activeSpaceIdRef.current !== targetSpaceId
      ) {
        return;
      }
      setInviteCode(code);
    } catch (err) {
      if (mountedRef.current && activeSpaceIdRef.current === targetSpaceId) {
        setError(formatSpaceError(err));
      }
    } finally {
      if (mountedRef.current && activeSpaceIdRef.current === targetSpaceId) {
        setBusy(false);
      }
    }
  }

  async function copyInviteCode() {
    if (!inviteCode) return;
    setError(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteCode);
      } else {
        const textarea = document.createElement("textarea");
        let attached = false;
        try {
          textarea.value = inviteCode;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          attached = true;
          textarea.select();
          const copiedWithFallback = document.execCommand("copy");
          if (!copiedWithFallback) throw new Error(t("spaceSetup.copyFailed"));
        } finally {
          if (attached) document.body.removeChild(textarea);
        }
      }
      clearCopyTimer();
      setCopied(true);
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        if (mountedRef.current) setCopied(false);
      }, 1500);
    } catch {
      setError(t("spaceSetup.copyFailed"));
    }
  }

  return (
    <GlassSurface
      as="section"
      level="section"
      className="setting-section space-invite-panel"
    >
      <div className="setting-section-title">
        <UserPlus size={14} aria-hidden="true" />
        <span>{t("settings.spaceInvite")}</span>
      </div>

      {inviteCode ? (
        <div className="space-invite-code-block">
          <button
            type="button"
            onClick={() => void copyInviteCode()}
            className="invite-code space-invite-code"
            aria-label={t("spaceSetup.copyInviteCode")}
          >
            {inviteCode}
          </button>
          <p className="muted small">
            {copied ? t("spaceSetup.copied") : t("spaceSetup.tapCopy")}
          </p>
        </div>
      ) : (
        <div className="space-invite-confirm">
          {requiresShareConfirmation && (
            <p className="muted small space-invite-warning">
              {t("settings.spaceInviteShareAll")}
            </p>
          )}
          <Button
            type="button"
            variant={requiresShareConfirmation ? "primary" : "secondary"}
            size="sm"
            onClick={() => void revealInvite()}
            loading={busy}
            leadingIcon={<UserPlus size={16} />}
            className="space-invite-action"
          >
            {requiresShareConfirmation
              ? t("settings.spaceInviteConfirm")
              : t("settings.spaceInvite")}
          </Button>
        </div>
      )}

      {error && <p className="error small">{error}</p>}
    </GlassSurface>
  );
}
