import { type FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";
import { Logo } from "../ui/Logo";
import { LangSwitch } from "../ui/LangSwitch";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../hooks/I18nContext";
import { useSpaceCtx } from "../../hooks/SpaceContext";

type Mode = "choice" | "shared";
const PENDING_SHARED_SETUP_KEY = "pinly.pendingSharedSetupInvite";

function quotaMessage(lang: string) {
  return lang === "vi"
    ? "Bạn đã đạt giới hạn tạo bản đồ của gói hiện tại."
    : "You have reached the map creation limit for your current plan.";
}

function readPendingSharedSetup() {
  try {
    return sessionStorage.getItem(PENDING_SHARED_SETUP_KEY) === "1";
  } catch {
    return false;
  }
}

function writePendingSharedSetup(pending: boolean) {
  try {
    if (pending) {
      sessionStorage.setItem(PENDING_SHARED_SETUP_KEY, "1");
    } else {
      sessionStorage.removeItem(PENDING_SHARED_SETUP_KEY);
    }
  } catch {
    /* Setup can continue even if sessionStorage is unavailable. */
  }
}

function formatSpaceError(err: unknown, lang: string) {
  if (err instanceof Error) {
    if (err.message === "space_quota_reached") {
      return quotaMessage(lang);
    }
    return err.message;
  }
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: unknown }).message);
    if (message === "space_quota_reached") {
      return quotaMessage(lang);
    }
    return message;
  }
  const message = String(err);
  return message === "space_quota_reached" ? quotaMessage(lang) : message;
}

export function SpaceSetup() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { lang, t } = useI18n();
  const {
    createPersonalSpace,
    createSharedSpace,
    createOrGetInvite,
    joinSpaceByInvite,
    activeSpace,
  } = useSpaceCtx();
  const [pendingSharedInvite, setPendingSharedInvite] = useState(
    readPendingSharedSetup,
  );
  const [mode, setMode] = useState<Mode>(() =>
    readPendingSharedSetup() ? "shared" : "choice",
  );
  const [inviteCode, setInviteCode] = useState("");
  const [sharedInviteCode, setSharedInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const recoveredInviteRef = useRef(false);
  const [busy, setBusy] = useState<"personal" | "shared" | "join" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handlePersonal() {
    setBusy("personal");
    setError(null);
    try {
      await createPersonalSpace();
      navigate("/", { replace: true });
    } catch (err) {
      setError(formatSpaceError(err, lang));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateShared() {
    setBusy("shared");
    setError(null);
    setCopied(false);
    setPendingSharedInvite(true);
    writePendingSharedSetup(true);
    recoveredInviteRef.current = true;
    let shouldKeepPendingInvite = false;
    try {
      const space =
        activeSpace && pendingSharedInvite
          ? activeSpace
          : await createSharedSpace();
      shouldKeepPendingInvite = true;
      const code = await createOrGetInvite(space.id);
      setSharedInviteCode(code);
    } catch (err) {
      if (!shouldKeepPendingInvite) {
        setPendingSharedInvite(false);
        writePendingSharedSetup(false);
        recoveredInviteRef.current = false;
      }
      setError(formatSpaceError(err, lang));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (
      !pendingSharedInvite ||
      sharedInviteCode ||
      !activeSpace ||
      busy ||
      recoveredInviteRef.current
    ) {
      return;
    }

    recoveredInviteRef.current = true;
    let cancelled = false;
    setBusy("shared");
    setError(null);

    void createOrGetInvite(activeSpace.id)
      .then((code) => {
        if (!cancelled) setSharedInviteCode(code);
      })
      .catch((err) => {
        if (!cancelled) setError(formatSpaceError(err, lang));
      })
      .finally(() => {
        if (!cancelled) setBusy((current) => (current === "shared" ? null : current));
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSpace,
    busy,
    createOrGetInvite,
    lang,
    pendingSharedInvite,
    sharedInviteCode,
  ]);

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    setBusy("join");
    setError(null);
    try {
      await joinSpaceByInvite(inviteCode);
      writePendingSharedSetup(false);
      setPendingSharedInvite(false);
      navigate("/", { replace: true });
    } catch (err) {
      setError(formatSpaceError(err, lang));
    } finally {
      setBusy(null);
    }
  }

  async function copyInviteCode() {
    if (!sharedInviteCode) return;
    setError(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sharedInviteCode);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = sharedInviteCode;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copiedWithFallback = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!copiedWithFallback) throw new Error(t("spaceSetup.copyFailed"));
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t("spaceSetup.copyFailed"));
    }
  }

  function continueToApp() {
    writePendingSharedSetup(false);
    setPendingSharedInvite(false);
    navigate("/", { replace: true });
  }

  if (
    activeSpace &&
    !pendingSharedInvite &&
    !sharedInviteCode &&
    busy !== "shared"
  ) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-page">
      <div className="auth-topbar">
        <LangSwitch />
      </div>
      <div className="auth-brand">
        <Logo size={56} />
        <h1>{t("spaceSetup.title")}</h1>
      </div>

      {mode === "choice" ? (
        <div className="stack">
          <Button onClick={handlePersonal} disabled={busy !== null}>
            {busy === "personal"
              ? t("spaceSetup.creating")
              : t("spaceSetup.personal")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setMode("shared")}
            disabled={busy !== null}
          >
            {t("spaceSetup.shared")}
          </Button>
        </div>
      ) : sharedInviteCode ? (
        <div className="stack">
          <p className="muted small">{t("spaceSetup.inviteReady")}</p>
          <button
            type="button"
            onClick={() => void copyInviteCode()}
            className="invite-code"
            aria-label={t("spaceSetup.copyInviteCode")}
          >
            {sharedInviteCode}
          </button>
          <p className="muted small">
            {copied ? t("spaceSetup.copied") : t("spaceSetup.tapCopy")}
          </p>
          <Button onClick={continueToApp}>
            {t("spaceSetup.continue")}
          </Button>
        </div>
      ) : (
        <>
          <div className="stack">
            <Button onClick={handleCreateShared} disabled={busy !== null}>
              {busy === "shared"
                ? t("spaceSetup.creating")
                : t("spaceSetup.createInvite")}
            </Button>
          </div>
          <div className="divider">
            <span>{t("pair.or")}</span>
          </div>
          <form onSubmit={handleJoin} className="auth-form">
            <input
              value={inviteCode}
              onChange={(event) => {
                setInviteCode(event.target.value.toUpperCase());
                if (error) setError(null);
              }}
              placeholder={t("spaceSetup.inviteCode")}
              maxLength={12}
              autoComplete="off"
              required
            />
            <Button type="submit" disabled={busy !== null || !inviteCode.trim()}>
              {busy === "join" ? t("spaceSetup.joining") : t("spaceSetup.join")}
            </Button>
          </form>
          <button
            type="button"
            className="link-btn"
            onClick={() => setMode("choice")}
          >
            {t("common.back")}
          </button>
        </>
      )}

      {error && <p className="error">{error}</p>}

      <button className="link-btn" onClick={() => signOut()}>
        {t("auth.signout")}
      </button>
    </div>
  );
}
