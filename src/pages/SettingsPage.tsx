import {
  LogOut,
  Globe,
  Heart,
  Copy,
  Check,
  Sun,
  Moon,
  ImageUp,
  X,
  Calendar,
  Bell,
  BellOff,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useCoupleCtx } from "../hooks/CoupleContext";
import { isDarkModeEnabled, useTheme } from "../hooks/ThemeContext";
import { useI18n } from "../hooks/I18nContext";
import { useNotifications } from "../hooks/useNotifications";
import { usePushSubscription } from "../hooks/usePushSubscription";
import { useNotificationPreferences } from "../hooks/useNotificationPreferences";
import { useMapStyle, MAP_STYLES } from "../hooks/useMapStyle";
import { Button } from "../components/ui/Button";
import { compressImage } from "../lib/imageCompress";
import { uploadToCloudinary, getImageUrl } from "../lib/cloudinary";

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { profile, partner, couple, updateCouple } = useCoupleCtx();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const notif = useNotifications();
  const push = usePushSubscription(user?.id);
  const notifPrefs = useNotificationPreferences(user?.id);
  const { styleId, setStyleId } = useMapStyle();
  const [copied, setCopied] = useState(false);
  const [annivDate, setAnnivDate] = useState(couple?.anniversary_date ?? "");
  const [annivSaving, setAnnivSaving] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const bgInput = useRef<HTMLInputElement | null>(null);
  const showDarkToggle = isDarkModeEnabled();

  async function copyCode() {
    if (!couple) return;
    await navigator.clipboard.writeText(couple.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function saveAnniversary() {
    if (!annivDate) return;
    setAnnivSaving(true);
    try {
      await updateCouple({ anniversary_date: annivDate });
    } finally {
      setAnnivSaving(false);
    }
  }

  async function handleBgUpload(file: File | undefined) {
    if (!file) return;
    setBgUploading(true);
    setBgError(null);
    try {
      const compressed = await compressImage(file);
      const res = await uploadToCloudinary(compressed, {
        folder: `pinly/${couple?.id ?? "shared"}`,
      });
      await updateCouple({ background_image_url: res.url });
    } catch (e) {
      setBgError(e instanceof Error ? e.message : String(e));
    } finally {
      setBgUploading(false);
    }
  }

  async function removeBg() {
    setBgUploading(true);
    try {
      await updateCouple({ background_image_url: null });
    } finally {
      setBgUploading(false);
    }
  }

  return (
    <div className="page page-settings">
      <header className="page-header">
        <h1>{t("settings.title")}</h1>
      </header>

      <section className="setting-section">
        <div className="setting-section-title">
          {showDarkToggle ? t("settings.appearance") : t("settings.language")}
        </div>

        {showDarkToggle && (
          <div className="setting-row compact">
            <span>{t("settings.theme")}</span>
            <div className="seg">
              <button
                className={`seg-btn ${theme === "light" ? "active" : ""}`}
                onClick={() => setTheme("light")}
              >
                <Sun size={14} /> {t("settings.themeLight")}
              </button>
              <button
                className={`seg-btn ${theme === "dark" ? "active" : ""}`}
                onClick={() => setTheme("dark")}
              >
                <Moon size={14} /> {t("settings.themeDark")}
              </button>
            </div>
          </div>
        )}

        <div className="setting-row compact">
          {showDarkToggle ? (
            <span>
              <Globe
                size={14}
                style={{ display: "inline", verticalAlign: "-2px" }}
              />{" "}
              {t("settings.language")}
            </span>
          ) : (
            <span className="muted small">
              {lang === "en" ? "Choose language" : "Chọn ngôn ngữ"}
            </span>
          )}
          <div className="seg">
            <button
              className={`seg-btn ${lang === "en" ? "active" : ""}`}
              onClick={() => setLang("en")}
            >
              EN
            </button>
            <button
              className={`seg-btn ${lang === "vi" ? "active" : ""}`}
              onClick={() => setLang("vi")}
            >
              VI
            </button>
          </div>
        </div>
      </section>

      <section className="setting-section">
        <div className="setting-section-title">{t("settings.mapStyle")}</div>
        <div className="map-style-grid">
          {MAP_STYLES.map((s) => (
            <button
              key={s.id}
              className={`map-style-card ${styleId === s.id ? "active" : ""}`}
              onClick={() => setStyleId(s.id)}
            >
              <div className="map-style-swatch">
                <span style={{ background: s.colors[0] }} />
                <span style={{ background: s.colors[1] }} />
                <span style={{ background: s.colors[2] }} />
              </div>
              <div className="map-style-label">
                {lang === "vi" ? s.labelVi : s.labelEn}
              </div>
              {styleId === s.id && (
                <span className="map-style-selected" aria-hidden="true">
                  <CheckCircle2 size={16} />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="setting-section">
        <div className="setting-section-title">
          <Bell
            size={12}
            style={{ display: "inline", verticalAlign: "-1px" }}
          />{" "}
          {t("notif.title")}
        </div>
        <div className="setting-row">
          <span>
            {push.subscribed
              ? t("notif.granted")
              : notif.permission === "denied"
                ? t("notif.denied")
                : t("notif.pushHint")}
          </span>
          {push.subscribed ? (
            <div className="seg">
              <button className="seg-btn active">
                <Bell size={14} /> ON
              </button>
              <button
                className="seg-btn"
                onClick={push.unsubscribe}
                disabled={push.loading}
              >
                <BellOff size={14} /> OFF
              </button>
            </div>
          ) : (
            <div className="seg">
              <button
                className="seg-btn"
                onClick={push.subscribe}
                disabled={push.loading || notif.permission === "denied"}
              >
                <Bell size={14} /> {push.loading ? "…" : "ON"}
              </button>
              <button className="seg-btn active">
                <BellOff size={14} /> OFF
              </button>
            </div>
          )}
        </div>
        {push.subscribed && (
          <div className="notif-pref-list">
            <label className="notif-pref-row">
              <span>
                <strong>{t("notif.memoryAdded")}</strong>
                <small>{t("notif.memoryAddedHint")}</small>
              </span>
              <input
                type="checkbox"
                checked={notifPrefs.prefs.memory_added}
                disabled={notifPrefs.loading}
                onChange={(e) =>
                  notifPrefs.updatePrefs({ memory_added: e.target.checked })
                }
              />
            </label>
            <label className="notif-pref-row">
              <span>
                <strong>{t("notif.reactions")}</strong>
                <small>{t("notif.reactionsHint")}</small>
              </span>
              <input
                type="checkbox"
                checked={notifPrefs.prefs.reactions}
                disabled={notifPrefs.loading}
                onChange={(e) =>
                  notifPrefs.updatePrefs({ reactions: e.target.checked })
                }
              />
            </label>
            <label className="notif-pref-row">
              <span>
                <strong>{t("notif.comments")}</strong>
                <small>{t("notif.commentsHint")}</small>
              </span>
              <input
                type="checkbox"
                checked={notifPrefs.prefs.comments}
                disabled={notifPrefs.loading}
                onChange={(e) =>
                  notifPrefs.updatePrefs({ comments: e.target.checked })
                }
              />
            </label>
          </div>
        )}
      </section>

      {couple && (
        <section className="setting-section">
          <div className="setting-section-title">
            <Calendar
              size={12}
              style={{ display: "inline", verticalAlign: "-1px" }}
            />{" "}
            {t("settings.anniversary")}
          </div>
          <div className="setting-row">
            <input
              type="date"
              value={annivDate}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => setAnnivDate(e.target.value)}
              className="setting-input"
            />
            <Button
              onClick={saveAnniversary}
              disabled={
                annivSaving ||
                !annivDate ||
                annivDate === couple.anniversary_date
              }
            >
              {annivSaving ? "…" : t("onboard.save")}
            </Button>
          </div>
        </section>
      )}

      {couple && (
        <section className="setting-section">
          <div className="setting-section-title">
            {t("settings.background")}
          </div>
          {couple.background_image_url && (
            <div className="bg-preview">
              <img src={getImageUrl(couple.background_image_url, 600)} alt="" />
            </div>
          )}
          <div className="row" style={{ padding: "12px 0" }}>
            <Button
              variant="secondary"
              onClick={() => bgInput.current?.click()}
              disabled={bgUploading}
            >
              <ImageUp size={16} /> {bgUploading ? "…" : t("settings.uploadBg")}
            </Button>
            {couple.background_image_url && (
              <Button variant="ghost" onClick={removeBg} disabled={bgUploading}>
                <X size={16} /> {t("settings.removeBg")}
              </Button>
            )}
            <input
              ref={bgInput}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                handleBgUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          {bgError && <p className="error">{bgError}</p>}
        </section>
      )}

      <section className="setting-section">
        <div className="setting-section-title">{t("settings.account")}</div>
        <div className="setting-row col">
          <div className="muted small">{t("settings.profile")}</div>
          <div>{profile?.display_name ?? user?.email}</div>
          <div className="muted small">{user?.email}</div>
        </div>
        {partner && (
          <div className="setting-row col">
            <div className="muted small">
              <Heart size={12} style={{ display: "inline" }} /> Partner
            </div>
            <div>{partner.display_name ?? partner.email}</div>
          </div>
        )}
        {couple && (
          <div className="setting-row">
            <span>{t("settings.inviteCode")}</span>
            <button className="copy-chip" onClick={copyCode}>
              <code>{couple.invite_code}</code>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
      </section>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginTop: "8px",
          paddingBottom: "20px",
        }}
      >
        <Button
          variant="ghost"
          onClick={async () => {
            if ("caches" in window) {
              const names = await caches.keys();
              await Promise.all(names.map((n) => caches.delete(n)));
            }
            const regs = await navigator.serviceWorker?.getRegistrations();
            if (regs) await Promise.all(regs.map((r) => r.unregister()));
            window.location.reload();
          }}
          style={{ width: "100%" }}
        >
          <RefreshCw size={16} /> {t("settings.clearCache")}
        </Button>

        <Button
          variant="danger"
          onClick={() => signOut()}
          style={{ width: "100%" }}
        >
          <LogOut size={16} /> {t("settings.signOut")}
        </Button>
      </div>
    </div>
  );
}
