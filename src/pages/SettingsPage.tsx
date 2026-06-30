import {
  LogOut,
  Globe,
  Heart,
  Sun,
  Moon,
  ImageUp,
  X,
  Calendar,
  Bell,
  BellOff,
  RefreshCw,
  CheckCircle2,
  Crown,
  FileText,
  ShieldCheck,
  HeartCrack,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCoupleCtx } from "../hooks/CoupleContext";
import { useSpaceCtx } from "../hooks/SpaceContext";
import { useTheme } from "../hooks/ThemeContext";
import { useI18n } from "../hooks/I18nContext";
import { useNotifications } from "../hooks/useNotifications";
import { usePushSubscription } from "../hooks/usePushSubscription";
import { useNotificationPreferences } from "../hooks/useNotificationPreferences";
import {
  useMapStyle,
  MAP_STYLES,
  type MapStyleOption,
} from "../hooks/useMapStyle";
import { useMap3DMode } from "../hooks/useMap3DMode";
import { useSubscription } from "../hooks/useSubscription";
import { PricingPage } from "./PricingPage";
import { MapStylePreviewSheet } from "../components/settings/MapStylePreviewSheet";
import { SpaceInvitePanel } from "../components/settings/SpaceInvitePanel";
import { SpaceSwitcher } from "../components/settings/SpaceSwitcher";
import { UpgradePrompt } from "../components/ui/UpgradePrompt";
import { Button } from "../components/ui/Button";
import { GlassSurface } from "../components/ui/GlassSurface";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Switch } from "../components/ui/Switch";
import { cx } from "../components/ui/uiClasses";
import { uploadToCloudinary, getImageUrl } from "../lib/cloudinary";
import { invalidateApiCacheByPrefix } from "../lib/apiCache";

const BREAKUP_CONFIRM_TEXT = "KET THUC";

async function compressBackgroundImage(file: File) {
  const { compressImage } = await import("../lib/imageCompress");
  return compressImage(file);
}

interface SettingSectionProps {
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

function SettingSection({
  title,
  icon,
  children,
  className = "",
}: SettingSectionProps) {
  return (
    <GlassSurface
      as="section"
      level="section"
      className={cx("setting-section", className)}
    >
      <div className="setting-section-title">
        {icon && <span className="setting-section-icon">{icon}</span>}
        <span>{title}</span>
      </div>
      {children}
    </GlassSurface>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, partner, couple, updateCouple, refresh, breakupCouple } =
    useCoupleCtx();
  const { capabilities } = useSpaceCtx();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const notif = useNotifications();
  const push = usePushSubscription(user?.id);
  const notifPrefs = useNotificationPreferences(user?.id);
  const {
    accountPlan,
    spacePlan,
    spaceOwnerId,
    ownedSpaceCount,
    ownedSpaceLimit,
    canCreateSpace,
    subscription,
    openCustomerPortal,
    canUseMapStyle,
    canUseMap3D,
    loading: subscriptionLoading,
  } = useSubscription();
  const { styleId, setStyleId } = useMapStyle(canUseMapStyle);
  const { map3DEnabled, setMap3DEnabled } = useMap3DMode(canUseMap3D);
  const [initialStyle] = useState(styleId);
  const canManageSpaceDetails = capabilities.canDeleteSpace;
  const duoFeaturesEnabled = capabilities.canUseDuoFeatures;
  const sortedStyles = useMemo(
    () =>
      [...MAP_STYLES].sort((a, b) => {
        if (a.id === initialStyle) return -1;
        if (b.id === initialStyle) return 1;
        return 0;
      }),
    [initialStyle],
  );
  const [showPricing, setShowPricing] = useState(false);
  const [planActionBusy, setPlanActionBusy] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const [annivDate, setAnnivDate] = useState(couple?.anniversary_date ?? "");
  const [annivSaving, setAnnivSaving] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const bgInput = useRef<HTMLInputElement | null>(null);
  const [previewStyle, setPreviewStyle] = useState<MapStyleOption | null>(null);
  const [showBreakupConfirm, setShowBreakupConfirm] = useState(false);
  const [breakupConfirmText, setBreakupConfirmText] = useState("");
  const [breakupBusy, setBreakupBusy] = useState(false);
  const [breakupError, setBreakupError] = useState<string | null>(null);
  const mapStylePreviewCenter = { lat: 10.8231, lng: 106.6297 };
  const breakupConfirmValid =
    breakupConfirmText.trim().toUpperCase() === BREAKUP_CONFIRM_TEXT;

  async function saveAnniversary() {
    if (!annivDate || !canManageSpaceDetails) return;
    setAnnivSaving(true);
    try {
      await updateCouple({ anniversary_date: annivDate });
    } finally {
      setAnnivSaving(false);
    }
  }

  async function handleBgUpload(file: File | undefined) {
    if (!file || !canManageSpaceDetails) return;
    setBgUploading(true);
    setBgError(null);
    try {
      const compressed = await compressBackgroundImage(file);
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
    if (!canManageSpaceDetails) return;
    setBgUploading(true);
    try {
      await updateCouple({ background_image_url: null });
    } finally {
      setBgUploading(false);
    }
  }

  function closeBreakupConfirm() {
    if (breakupBusy) return;
    setShowBreakupConfirm(false);
    setBreakupConfirmText("");
    setBreakupError(null);
  }

  async function handleBreakupCouple() {
    if (!breakupConfirmValid || breakupBusy || !canManageSpaceDetails) return;
    setBreakupBusy(true);
    setBreakupError(null);
    try {
      await breakupCouple(breakupConfirmText);
      invalidateApiCacheByPrefix("couple-stats:");
      setShowBreakupConfirm(false);
      setBreakupConfirmText("");
      await refresh({ silent: true });
      navigate("/", { replace: true });
    } catch (e) {
      setBreakupError(
        e instanceof Error ? e.message : t("settings.breakupError"),
      );
    } finally {
      setBreakupBusy(false);
    }
  }

  async function handleManagePlan() {
    if (subscriptionLoading || planActionBusy) return;

    if (accountPlan === "free") {
      setShowPricing(true);
      return;
    }

    setPlanActionBusy(true);
    try {
      await openCustomerPortal();
    } catch {
      setPlanActionBusy(false);
      setShowPricing(true);
    }
  }

  const accountPlanName = subscriptionLoading
    ? "..."
    : accountPlan === "free"
      ? "Free"
      : accountPlan === "plus"
        ? "Plus"
        : "Pro";
  const effectiveSpacePlanName =
    spacePlan === "free" ? "FREE" : spacePlan === "plus" ? "PLUS" : "PRO";
  const quotaReached = !subscriptionLoading && !canCreateSpace;

  return (
    <div className="page page-settings">
      <header className="page-header settings-header">
        <div>
          <p className="settings-kicker">Pinly</p>
          <h1>{t("settings.title")}</h1>
        </div>
      </header>

      {/* Subscription section */}
      <SettingSection
        title={lang === "vi" ? "Gói của bạn" : "Your Plan"}
        icon={<Crown size={14} />}
        className="setting-section-plan"
      >
        <div className="setting-plan-overview">
          <div className="setting-plan-main">
            <span className="setting-plan-name">
              {accountPlanName}
            </span>
            <div className="setting-plan-actions">
              {accountPlan === "free" ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleManagePlan()}
                  loading={planActionBusy}
                  disabled={subscriptionLoading || planActionBusy}
                  className="setting-plan-upgrade"
                >
                  {planActionBusy
                    ? lang === "vi"
                      ? "Đang mở..."
                      : "Opening..."
                    : lang === "vi"
                      ? "Nâng cấp"
                      : "Upgrade"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleManagePlan()}
                  loading={planActionBusy}
                  disabled={subscriptionLoading || planActionBusy}
                  className="setting-plan-manage"
                >
                  {planActionBusy
                    ? lang === "vi"
                      ? "Đang mở..."
                      : "Opening..."
                    : lang === "vi"
                      ? "Quản lý gói"
                      : "Manage plan"}
                </Button>
              )}
            </div>
          </div>
          {accountPlan !== "free" && (
            <span className="muted setting-plan-meta">
              {subscription
                ? `${lang === "vi" ? "Hết hạn" : "Expires"}: ${new Date(subscription.current_period_end).toLocaleDateString("vi-VN")}`
                : lang === "vi"
                  ? "Đang hoạt động"
                  : "Active"}
            </span>
          )}
          {!subscriptionLoading && (
            <span className="muted setting-plan-meta">
              {lang === "vi"
                ? `Bản đồ: ${ownedSpaceCount}/${ownedSpaceLimit}`
                : `Maps: ${ownedSpaceCount}/${ownedSpaceLimit}`}
            </span>
          )}
          {!subscriptionLoading && spacePlan !== accountPlan && spaceOwnerId && (
            <span className="muted setting-plan-meta">
              {lang === "vi"
                ? `Space này dùng gói owner: ${effectiveSpacePlanName}`
                : `This space uses owner plan: ${effectiveSpacePlanName}`}
            </span>
          )}
          {quotaReached && (
            <span className="muted setting-plan-meta">
              {lang === "vi"
                ? "Bạn đã đạt giới hạn tạo bản đồ của gói hiện tại."
                : "You have reached the map limit for your current plan."}
            </span>
          )}
        </div>
      </SettingSection>

      <SpaceSwitcher />
      <SpaceInvitePanel />

      <SettingSection title={t("settings.appearance")} icon={<Sun size={14} />}>
        <div className="setting-row compact">
          <span>{t("settings.theme")}</span>
          <SegmentedControl
            value={theme}
            label={t("settings.theme")}
            size="sm"
            options={[
              {
                value: "light",
                label: (
                  <>
                    <Sun size={14} /> {t("settings.themeLight")}
                  </>
                ),
              },
              {
                value: "dark",
                label: (
                  <>
                    <Moon size={14} /> {t("settings.themeDark")}
                  </>
                ),
              },
            ]}
            onChange={setTheme}
          />
        </div>

        <div className="setting-row compact">
          <span className="setting-row-label">
            <Globe size={14} aria-hidden="true" />
            {t("settings.language")}
          </span>
          <SegmentedControl
            value={lang}
            label={t("settings.language")}
            size="sm"
            options={[
              { value: "en", label: "EN" },
              { value: "vi", label: "VI" },
            ]}
            onChange={setLang}
          />
        </div>
      </SettingSection>

      <SettingSection
        title={t("settings.mapStyle")}
        className="setting-section-map-style"
      >
        <div className="setting-row compact">
          <span>{t("settings.map3d")}</span>
          {canUseMap3D ? (
            <Switch
              aria-label={t("settings.map3d")}
              checked={map3DEnabled}
              onChange={(e) => setMap3DEnabled(e.target.checked)}
            />
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setUpgradeFeature(lang === "vi" ? "Bản đồ 3D" : "3D map mode")
              }
            >
              {lang === "vi" ? "Nâng cấp" : "Upgrade"}
            </Button>
          )}
        </div>
        {!canUseMap3D && (
          <p className="muted small">{t("settings.map3dHint")}</p>
        )}
        <div className="map-style-grid">
          {sortedStyles.map((s) => {
            const locked = !canUseMapStyle(s.id);
            const active = styleId === s.id;
            const label = lang === "vi" ? s.labelVi : s.labelEn;
            const stateLabel = active
              ? lang === "vi"
                ? "đang chọn"
                : "selected"
              : lang === "vi"
                ? "chưa chọn"
                : "not selected";
            const accessLabel = locked
              ? lang === "vi"
                ? "cần nâng cấp"
                : "upgrade required"
              : lang === "vi"
                ? "có thể chọn"
                : "available";
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                aria-label={`${label}, ${stateLabel}, ${accessLabel}`}
                className={`map-style-card ${active ? "active" : ""} ${locked ? "locked" : ""}`}
                onClick={() => setPreviewStyle(s)}
              >
                <span className="map-style-card-visual">
                  <img
                    className="map-style-card-thumb"
                    src={`/map-style-previews/${s.id}.png`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={({ currentTarget }) => {
                      currentTarget.hidden = true;
                    }}
                  />
                  <svg
                    className="map-style-card-map"
                    viewBox="0 0 72 48"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <rect width="72" height="48" rx="10" fill={s.colors[0]} />
                    <path
                      className="map-style-card-water"
                      d="M48 -6 C43 9 48 18 62 23 C72 27 77 35 73 48 L72 48 L72 -6 Z"
                      fill={s.colors[1]}
                    />
                    <path
                      className="map-style-card-area"
                      d="M5 31 C15 25 23 27 30 34 C36 41 47 39 58 33 L62 48 L4 48 Z"
                      fill={s.colors[1]}
                    />
                    <path
                      className="map-style-card-road-soft"
                      d="M-5 16 C14 14 22 23 38 19 C50 16 57 7 77 10"
                      stroke={s.colors[2]}
                    />
                    <path
                      className="map-style-card-road-soft"
                      d="M13 -4 C15 13 11 25 16 53"
                      stroke={s.colors[2]}
                    />
                    <path
                      className="map-style-card-road-soft"
                      d="M-4 40 C16 34 34 35 76 24"
                      stroke={s.colors[2]}
                    />
                    <path
                      className="map-style-card-route"
                      d="M-3 27 C11 22 22 24 31 18 C42 11 53 14 75 4"
                      stroke={s.colors[2]}
                    />
                    <path
                      className="map-style-card-road-line"
                      d="M8 6 L28 20 M32 4 L50 20 M23 46 L36 29 M45 45 L55 24"
                      stroke={s.colors[2]}
                    />
                  </svg>
                </span>
                <div className="map-style-label">
                  {label}
                  {locked && " 🔒"}
                </div>
                {active && (
                  <span className="map-style-selected" aria-hidden="true">
                    <CheckCircle2 size={16} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </SettingSection>

      <MapStylePreviewSheet
        open={Boolean(previewStyle)}
        style={previewStyle}
        currentStyleId={styleId}
        locked={previewStyle ? !canUseMapStyle(previewStyle.id) : false}
        initialCenter={mapStylePreviewCenter}
        lang={lang}
        labels={{
          title: previewStyle
            ? t("settings.mapStylePreview").replace(
                "{{style}}",
                lang === "vi" ? previewStyle.labelVi : previewStyle.labelEn,
              )
            : t("settings.mapStyle"),
          hint: t("settings.mapStylePreviewHint"),
          cancel: t("common.cancel"),
          apply: t("settings.applyMapStyle"),
          applied: t("settings.mapStyleApplied"),
          loading: t("settings.mapStyleLoading"),
          error: t("settings.mapStyleLoadError"),
        }}
        onClose={() => setPreviewStyle(null)}
        onApply={() => {
          if (!previewStyle) return;
          if (!canUseMapStyle(previewStyle.id)) {
            setUpgradeFeature(
              lang === "vi" ? "Map styles premium" : "Premium map styles",
            );
            setPreviewStyle(null);
            return;
          }
          setStyleId(previewStyle.id);
          setPreviewStyle(null);
        }}
      />

      <SettingSection
        title={t("notif.title")}
        icon={<Bell size={14} />}
        className="setting-section-notifications"
      >
        <div className="setting-row">
          <span>
            {push.subscribed
              ? t("notif.granted")
              : notif.permission === "denied"
                ? t("notif.denied")
                : t("notif.pushHint")}
          </span>
          {push.subscribed ? (
            <SegmentedControl
              value="on"
              label={t("notif.title")}
              options={[
                {
                  value: "on",
                  label: (
                    <>
                      <Bell size={14} /> ON
                    </>
                  ),
                },
                {
                  value: "off",
                  label: (
                    <>
                      <BellOff size={14} /> OFF
                    </>
                  ),
                  disabled: push.loading,
                },
              ]}
              onChange={(value) => {
                if (value === "off") void push.unsubscribe();
              }}
            />
          ) : (
            <SegmentedControl
              value="off"
              label={t("notif.title")}
              options={[
                {
                  value: "on",
                  label: (
                    <>
                      <Bell size={14} /> {push.loading ? "…" : "ON"}
                    </>
                  ),
                  disabled: push.loading || notif.permission === "denied",
                },
                {
                  value: "off",
                  label: (
                    <>
                      <BellOff size={14} /> OFF
                    </>
                  ),
                },
              ]}
              onChange={(value) => {
                if (value === "on") void push.subscribe();
              }}
            />
          )}
        </div>
        {duoFeaturesEnabled && (
          <div className="notif-pref-list">
          <div className="notif-pref-row">
            <span>
              <strong>{t("notif.memoryAdded")}</strong>
              <small>{t("notif.memoryAddedHint")}</small>
            </span>
            <Switch
              aria-label={t("notif.memoryAdded")}
              checked={notifPrefs.prefs.memory_added}
              disabled={notifPrefs.loading}
              onChange={(e) =>
                notifPrefs.updatePrefs({ memory_added: e.target.checked })
              }
            />
          </div>
          <div className="notif-pref-row">
            <span>
              <strong>{t("notif.reactions")}</strong>
              <small>{t("notif.reactionsHint")}</small>
            </span>
            <Switch
              aria-label={t("notif.reactions")}
              checked={notifPrefs.prefs.reactions}
              disabled={notifPrefs.loading}
              onChange={(e) =>
                notifPrefs.updatePrefs({ reactions: e.target.checked })
              }
            />
          </div>
          <div className="notif-pref-row">
            <span>
              <strong>{t("notif.comments")}</strong>
              <small>{t("notif.commentsHint")}</small>
            </span>
            <Switch
              aria-label={t("notif.comments")}
              checked={notifPrefs.prefs.comments}
              disabled={notifPrefs.loading}
              onChange={(e) =>
                notifPrefs.updatePrefs({ comments: e.target.checked })
              }
            />
          </div>
          <div className="notif-pref-row">
            <span>
              <strong>{t("notif.streakReminders")}</strong>
              <small>{t("notif.streakRemindersHint")}</small>
            </span>
            <Switch
              aria-label={t("notif.streakReminders")}
              checked={notifPrefs.prefs.streak_reminders}
              disabled={notifPrefs.loading}
              onChange={(e) =>
                notifPrefs.updatePrefs({
                  streak_reminders: e.target.checked,
                })
              }
            />
          </div>
          <div className="notif-pref-row">
            <span>
              <strong>{t("notif.streakEmailReminders")}</strong>
              <small>{t("notif.streakEmailRemindersHint")}</small>
            </span>
            <Switch
              aria-label={t("notif.streakEmailReminders")}
              checked={notifPrefs.prefs.streak_email_reminders}
              disabled={notifPrefs.loading}
              onChange={(e) =>
                notifPrefs.updatePrefs({
                  streak_email_reminders: e.target.checked,
                })
              }
            />
          </div>
          </div>
        )}
      </SettingSection>

      {couple && canManageSpaceDetails && (
        <SettingSection
          title={t("settings.anniversary")}
          icon={<Calendar size={14} />}
        >
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
        </SettingSection>
      )}

      {couple && canManageSpaceDetails && (
        <SettingSection
          title={t("settings.background")}
          icon={<ImageUp size={14} />}
          className="setting-section-background"
        >
          {couple.background_image_url && (
            <div className="bg-preview">
              <img src={getImageUrl(couple.background_image_url, 600)} alt="" />
            </div>
          )}
          <div className="setting-button-row">
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
              hidden
              onChange={(e) => {
                handleBgUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          {bgError && <p className="error">{bgError}</p>}
        </SettingSection>
      )}

      <SettingSection
        title={t("settings.legal")}
        icon={<ShieldCheck size={14} />}
        className="setting-section-legal"
      >
        <p className="muted small settings-legal-desc">
          {t("settings.legalDesc")}
        </p>
        <div className="settings-legal-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/privacy")}
            className="settings-legal-button"
          >
            <ShieldCheck size={16} /> {t("legal.privacy")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/terms")}
            className="settings-legal-button"
          >
            <FileText size={16} /> {t("legal.terms")}
          </Button>
        </div>
      </SettingSection>

      <SettingSection
        title={t("settings.account")}
        className="setting-section-account"
      >
        <div className="setting-row col">
          <div className="muted small">{t("settings.profile")}</div>
          <div>{profile?.display_name ?? user?.email}</div>
          <div className="muted small">{user?.email}</div>
        </div>
        {partner && (
          <div className="setting-row col">
            <div className="muted small">
              <span className="setting-row-label">
                <Heart size={12} aria-hidden="true" />
                {t("common.partner")}
              </span>
            </div>
            <div>{partner.display_name ?? partner.email}</div>
          </div>
        )}
      </SettingSection>

      {couple && canManageSpaceDetails && (
        <SettingSection
          title={t("settings.breakupTitle")}
          icon={<HeartCrack size={14} />}
          className="setting-section-breakup"
        >
          <div className="setting-row col">
            <p className="muted small settings-breakup-desc">
              {t("settings.breakupDesc")}
            </p>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setBreakupError(null);
                setBreakupConfirmText("");
                setShowBreakupConfirm(true);
              }}
              className="settings-full-button"
            >
              <HeartCrack size={16} /> {t("settings.breakupButton")}
            </Button>
          </div>
        </SettingSection>
      )}

      <div className="settings-action-stack">
        <Button
          variant="ghost"
          onClick={async () => {
            if ("caches" in window) {
              const names = await caches.keys();
              // Only clear runtime caches; preserve precache to avoid breaking
              // asset loading and keep SW + push subscriptions intact.
              const runtime = names.filter(
                (n) => !n.startsWith("workbox-precache"),
              );
              await Promise.all(runtime.map((n) => caches.delete(n)));
            }
            window.location.reload();
          }}
          className="settings-full-button"
        >
          <RefreshCw size={16} /> {t("settings.clearCache")}
        </Button>

        <Button
          variant="danger"
          onClick={() => signOut()}
          className="settings-full-button"
        >
          <LogOut size={16} /> {t("settings.signOut")}
        </Button>
      </div>

      {upgradeFeature && (
        <UpgradePrompt
          feature={upgradeFeature}
          onUpgrade={() => {
            setUpgradeFeature(null);
            setShowPricing(true);
          }}
          onDismiss={() => setUpgradeFeature(null)}
        />
      )}

      {showPricing && (
        <div className="pricing-overlay">
          <PricingPage onClose={() => setShowPricing(false)} />
        </div>
      )}

      {showBreakupConfirm && (
        <div className="breakup-confirm-overlay lg-overlay-backdrop">
          <div
            className="breakup-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="breakup-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="breakup-confirm-close"
              onClick={closeBreakupConfirm}
              disabled={breakupBusy}
              aria-label={t("common.cancel")}
            >
              <X size={18} />
            </button>
            <div className="breakup-confirm-icon">
              <HeartCrack size={24} />
            </div>
            <h3 id="breakup-confirm-title">
              {t("settings.breakupModalTitle")}
            </h3>
            <p>{t("settings.breakupModalBody")}</p>
            <label className="breakup-confirm-field">
              <span>{t("settings.breakupConfirmLabel")}</span>
              <input
                value={breakupConfirmText}
                onChange={(e) => {
                  setBreakupConfirmText(e.target.value);
                  if (breakupError) setBreakupError(null);
                }}
                placeholder={t("settings.breakupConfirmPlaceholder")}
                autoCapitalize="characters"
                autoComplete="off"
                disabled={breakupBusy}
              />
            </label>
            {breakupError && <p className="error">{breakupError}</p>}
            <div className="breakup-confirm-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={closeBreakupConfirm}
                disabled={breakupBusy}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleBreakupCouple()}
                disabled={!breakupConfirmValid || breakupBusy}
              >
                {breakupBusy
                  ? t("settings.breakupDeleting")
                  : t("settings.breakupConfirmButton")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
