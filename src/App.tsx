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
import { DesktopGate } from "./components/ui/DesktopGate";
import { Logo } from "./components/ui/Logo";
import { getImageUrl } from "./lib/cloudinary";
import { useAuth } from "./hooks/useAuth";
import { CoupleProvider, useCoupleCtx } from "./hooks/CoupleContext";
import { PinsProvider } from "./hooks/PinsContext";
import { CategoriesProvider } from "./hooks/CategoriesContext";
import { ThemeProvider } from "./hooks/ThemeContext";
import { I18nProvider } from "./hooks/I18nContext";
import { ToastProvider } from "./hooks/ToastContext";
import { usePushSubscription } from "./hooks/usePushSubscription";
import { NotificationFeedProvider } from "./hooks/NotificationFeedContext";
import { SubscriptionProvider } from "./hooks/useSubscription";
import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";

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
const CoupleSetup = lazy(() =>
  import("./components/auth/CoupleSetup").then((module) => ({
    default: module.CoupleSetup,
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

function AppStatusScreen({
  title,
  body,
  children,
  tone = "idle",
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  tone?: "idle" | "error";
}) {
  return (
    <div className={`full-center app-status-screen ${tone}`}>
      <div className="app-status-card">
        <div className="app-status-logo">
          <Logo size={44} />
        </div>
        <h2>{title}</h2>
        {body && <p className="muted">{body}</p>}
        {children}
      </div>
    </div>
  );
}

function PairedShell() {
  const { couple, profile } = useCoupleCtx();
  const location = useLocation();
  const navigate = useNavigate();
  const isMap = location.pathname === "/";
  const bgUrl = couple?.background_image_url;
  const backgroundImageUrl = bgUrl ? getImageUrl(bgUrl, 1200) : undefined;
  const backgroundPreloadRef = useRef<HTMLImageElement | null>(null);
  const push = usePushSubscription(profile?.id);

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
        className={`app-shell ${isMap ? "shell-map" : "shell-page"} ${bgUrl ? "has-bg" : ""}`}
        style={shellStyle}
      >
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/memory/:pinId" element={<MemoryDeepLinkPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
        <AnniversaryPrompt />
        <NotificationToast />
      </div>
    </NotificationFeedProvider>
  );
}

function PinsScope() {
  const { couple, profile } = useCoupleCtx();

  return (
    <SubscriptionProvider coupleId={couple?.id ?? null}>
      <PinsProvider coupleId={couple?.id} userId={profile?.id}>
        <CategoriesProvider coupleId={couple?.id} userId={profile?.id}>
          <RoutedShell />
        </CategoriesProvider>
      </PinsProvider>
    </SubscriptionProvider>
  );
}

function RoutedShell() {
  const { couple, loading, error } = useCoupleCtx();

  if (loading) return <AppStatusScreen title="Loading Pinly…" />;

  if (error) {
    return (
      <AppStatusScreen title="Something went wrong" body={error} tone="error">
        <p className="muted small">
          Nếu lỗi vẫn tiếp diễn, hãy thử tải lại ứng dụng hoặc liên hệ hỗ trợ.
        </p>
      </AppStatusScreen>
    );
  }

  const paired = !!couple && !!couple.user_b;
  if (!paired) {
    return (
      <Routes>
        <Route path="/setup" element={<CoupleSetup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return <PairedShell />;
}

function AppRoutes() {
  const { user, loading: authLoading, isRecovery } = useAuth();

  if (authLoading) return <AppStatusScreen title="Loading Pinly…" />;

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
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        path="*"
        element={
          <DesktopGate>
            <ConsentGate userId={user.id}>
              <CoupleProvider userId={user.id}>
                <PinsScope />
              </CoupleProvider>
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
            <Suspense fallback={<AppStatusScreen title="Loading Pinly…" />}>
              <AppRoutes />
            </Suspense>
            <UpdatePrompt />
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
