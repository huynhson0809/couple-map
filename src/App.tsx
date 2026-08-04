import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { BottomNav } from "./components/ui/BottomNav";
import { UpdatePrompt } from "./components/ui/UpdatePrompt";
import { AnniversaryPrompt } from "./components/onboard/AnniversaryPrompt";
import { NotificationToast } from "./components/ui/NotificationToast";
import { LockKeyhole } from "lucide-react";
import { AppStatusScreen } from "./components/ui/AppStatusScreen";
import { DesktopGate } from "./components/ui/DesktopGate";
import { WebAnalytics } from "./components/analytics/WebAnalytics";
import { getImageUrl } from "./lib/cloudinary";
import { useAuth } from "./hooks/useAuth";
import { CoupleProvider, useCoupleCtx } from "./hooks/CoupleContext";
import { SpaceProvider, useSpaceCtx } from "./hooks/SpaceContext";
import { PinsProvider } from "./hooks/PinsContext";
import { CategoriesProvider } from "./hooks/CategoriesContext";
import { ThemeProvider } from "./hooks/ThemeContext";
import { I18nProvider, useI18n } from "./hooks/I18nContext";
import { ToastProvider } from "./hooks/ToastContext";
import { usePushSubscription } from "./hooks/usePushSubscription";
import { useAccountPreferencesSync } from "./hooks/useAccountPreferencesSync";
import { NotificationFeedProvider } from "./hooks/NotificationFeedContext";
import { SubscriptionProvider, useSubscription } from "./hooks/useSubscription";
import { getPublicPageRouteByPath } from "./content/publicPages";
import { lazy, Suspense, useEffect, useRef } from "react";

const LoginPage = lazy(() =>
  import("./components/auth/LoginPage").then((module) => ({
    default: module.LoginPage,
  })),
);
const RegisterPage = lazy(() =>
  import("./components/auth/RegisterPage").then((module) => ({
    default: module.RegisterPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("./components/auth/ForgotPasswordPage").then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("./components/auth/ResetPasswordPage").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const ConsentGate = lazy(() =>
  import("./components/auth/ConsentGate").then((module) => ({
    default: module.ConsentGate,
  })),
);
const SpaceSetup = lazy(() =>
  import("./components/auth/SpaceSetup").then((module) => ({
    default: module.SpaceSetup,
  })),
);
const PrivacyPage = lazy(() =>
  import("./components/legal/PolicyPage").then((module) => ({
    default: () => <module.PolicyPage kind="privacy" />,
  })),
);
const TermsPage = lazy(() =>
  import("./components/legal/PolicyPage").then((module) => ({
    default: () => <module.PolicyPage kind="terms" />,
  })),
);
const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((module) => ({
    default: module.LandingPage,
  })),
);
const PublicContentPage = lazy(() =>
  import("./pages/PublicContentPage").then((module) => ({
    default: module.PublicContentPage,
  })),
);
const PublicPolicyPage = lazy(() =>
  import("./pages/PublicPolicyPage").then((module) => ({
    default: module.PublicPolicyPage,
  })),
);
const MapPage = lazy(() =>
  import("./pages/MapPage").then((module) => ({ default: module.MapPage })),
);

const TimelinePage = lazy(() =>
  import("./pages/TimelinePage").then((module) => ({
    default: module.TimelinePage,
  })),
);
const MemoryDeepLinkPage = lazy(() =>
  import("./pages/MemoryDeepLinkPage").then((module) => ({
    default: module.MemoryDeepLinkPage,
  })),
);
const WishlistPage = lazy(() =>
  import("./pages/WishlistPage").then((module) => ({
    default: module.WishlistPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("./pages/NotificationsPage").then((module) => ({
    default: module.NotificationsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const YearReplayPage = lazy(() =>
  import("./pages/YearReplayPage").then((module) => ({
    default: module.YearReplayPage,
  })),
);
const AdminSupportPage = lazy(() =>
  import("./pages/AdminSupportPage").then((module) => ({
    default: module.AdminSupportPage,
  })),
);

function LocalizedLoadingScreen() {
  const { t } = useI18n();
  return <AppStatusScreen title={t("app.loading")} />;
}

function PairedShell() {
  const { activeSpace, profile } = useSpaceCtx();
  const location = useLocation();
  const navigate = useNavigate();
  const isMap = location.pathname === "/";
  const isReplay =
    location.pathname === "/replay" ||
    location.pathname.startsWith("/replay/");
  const bgUrl = activeSpace?.background_image_url;
  const backgroundImageUrl = bgUrl ? getImageUrl(bgUrl, 1200) : undefined;
  const backgroundPreloadRef = useRef<HTMLImageElement | null>(null);
  const push = usePushSubscription(profile?.id);
  const { currentSpaceWritable, loading: subscriptionLoading } =
    useSubscription();
  const { t } = useI18n();

  // Listen for SW notification click messages
  useEffect(() => {
    function handleSWMessage(event: MessageEvent) {
      if (event.data?.type === "NOTIFICATION_CLICK" && event.data.url) {
        navigate(event.data.url);
      }
    }
    navigator.serviceWorker?.addEventListener("message", handleSWMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
    };
  }, [navigate]);

  // Auto-subscribe to push if permission already granted
  useEffect(() => {
    if (
      profile?.id &&
      !push.subscribed &&
      !push.loading &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      "PushManager" in window
    ) {
      push.subscribe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, push.subscribed]);

  // Warm the shell background even while the map route suppresses the paint layer.
  useEffect(() => {
    if (!backgroundImageUrl) {
      backgroundPreloadRef.current = null;
      return;
    }

    const preloadImage = new Image();
    preloadImage.decoding = "async";
    preloadImage.src = backgroundImageUrl;
    backgroundPreloadRef.current = preloadImage;
  }, [backgroundImageUrl]);

  const shellStyle =
    backgroundImageUrl && !isMap
      ? ({
          backgroundImage: `var(--app-shell-photo-overlay), url(${backgroundImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        } as React.CSSProperties)
      : undefined;
  return (
    <NotificationFeedProvider>
      <div
        className={`app-shell ${isMap ? "shell-map" : "shell-page"} ${bgUrl ? "has-bg" : ""} ${!subscriptionLoading && !currentSpaceWritable ? "space-read-only" : ""}`}
        style={shellStyle}
      >
        {!isReplay && !subscriptionLoading && !currentSpaceWritable && (
          <div className="space-read-only-banner" role="status">
            <span className="space-read-only-banner-icon" aria-hidden="true">
              <LockKeyhole size={17} />
            </span>
            <span className="space-read-only-banner-copy">
              <strong>{t("settings.spaceReadOnlyBannerTitle")}</strong>
              <span>{t("settings.spaceReadOnlyBannerBody")}</span>
            </span>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="space-read-only-banner-action"
            >
              {t("settings.spaceReadOnlyManage")}
            </button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/memory/:pinId" element={<MemoryDeepLinkPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/replay" element={<YearReplayPage />} />
          <Route path="/replay/:year" element={<YearReplayPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {!isReplay && <BottomNav />}
        {!isReplay && <AnniversaryPrompt />}
        <NotificationToast />
      </div>
    </NotificationFeedProvider>
  );
}

function PinsScope() {
  const { couple, profile: coupleProfile } = useCoupleCtx();
  const { activeSpace, profile: spaceProfile } = useSpaceCtx();
  const scopedId = activeSpace?.id ?? couple?.id ?? null;
  const scopedUserId = spaceProfile?.id ?? coupleProfile?.id;

  return (
    <SubscriptionProvider
      spaceId={scopedId}
      userId={scopedUserId}
      spaceOwnerIdHint={activeSpace?.owner_id ?? null}
      spacePlanHint={activeSpace?.plan ?? null}
    >
      <PinsProvider spaceId={scopedId} userId={scopedUserId}>
        <CategoriesProvider spaceId={scopedId} userId={scopedUserId}>
          <RoutedShell />
        </CategoriesProvider>
      </PinsProvider>
    </SubscriptionProvider>
  );
}

function RoutedShell() {
  const { activeSpace, loading, error } = useSpaceCtx();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) return <AppStatusScreen title={t("app.loading")} />;

  if (error) {
    return (
      <AppStatusScreen
        title={t("app.loadErrorTitle")}
        body={t("app.loadErrorBody")}
        tone="error"
      />
    );
  }

  if (!activeSpace) {
    return (
      <Routes>
        <Route path="/setup" element={<SpaceSetup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  if (location.pathname === "/setup") {
    return (
      <Routes>
        <Route path="/setup" element={<SpaceSetup />} />
        <Route path="*" element={<PairedShell />} />
      </Routes>
    );
  }

  return <PairedShell />;
}

function AppRoutes() {
  const { user, loading: authLoading, isRecovery } = useAuth();
  const { t } = useI18n();
  useAccountPreferencesSync(user?.id);
  const location = useLocation();
  const publicRoute = getPublicPageRouteByPath(location.pathname);

  if (publicRoute && publicRoute.page.key !== "home") {
    return (
      <>
        <PublicContentPage
          pageKey={publicRoute.page.key}
          language={publicRoute.language}
        />
        <WebAnalytics />
      </>
    );
  }

  if (publicRoute?.page.key === "home" && publicRoute.language === "vi") {
    return (
      <>
        <LandingPage language="vi" />
        <WebAnalytics />
      </>
    );
  }

  if (authLoading) return <AppStatusScreen title={t("app.loading")} />;

  // Show reset password page when user clicked recovery link
  if (isRecovery && user) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="*" element={<ResetPasswordPage />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <>
        <Routes>
          <Route path="/" element={<LandingPage language="en" />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/privacy"
            element={<PublicPolicyPage kind="privacy" language="en" />}
          />
          <Route
            path="/terms"
            element={<PublicPolicyPage kind="terms" language="en" />}
          />
          <Route
            path="/vi/privacy"
            element={<PublicPolicyPage kind="privacy" language="vi" />}
          />
          <Route
            path="/vi/terms"
            element={<PublicPolicyPage kind="terms" language="vi" />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <WebAnalytics />
      </>
    );
  }

  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/vi/privacy" element={<PrivacyPage />} />
      <Route path="/vi/terms" element={<TermsPage />} />
      <Route
        path="/admin/support"
        element={
          <ConsentGate key={user.id} userId={user.id}>
            <AdminSupportPage
              key={user.id}
              userId={user.id}
              userEmail={user.email}
            />
          </ConsentGate>
        }
      />
      <Route
        path="*"
        element={
          <DesktopGate>
            <ConsentGate key={user.id} userId={user.id}>
              <SpaceProvider userId={user.id}>
                <CoupleProvider userId={user.id}>
                  <PinsScope />
                </CoupleProvider>
              </SpaceProvider>
            </ConsentGate>
          </DesktopGate>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<LocalizedLoadingScreen />}>
              <AppRoutes />
            </Suspense>
            <UpdatePrompt />
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
