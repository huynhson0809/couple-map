import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { LoginPage } from "./components/auth/LoginPage";
import { RegisterPage } from "./components/auth/RegisterPage";
import { ForgotPasswordPage } from "./components/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./components/auth/ResetPasswordPage";
import { CoupleSetup } from "./components/auth/CoupleSetup";
import { MapPage } from "./pages/MapPage";
import { TimelinePage } from "./pages/TimelinePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { WishlistPage } from "./pages/WishlistPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BottomNav } from "./components/ui/BottomNav";
import { UpdatePrompt } from "./components/ui/UpdatePrompt";
import { AnniversaryPrompt } from "./components/onboard/AnniversaryPrompt";
import { NotificationToast } from "./components/ui/NotificationToast";
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
import { useEffect } from "react";

function PairedShell() {
  const { couple, profile } = useCoupleCtx();
  const location = useLocation();
  const isMap = location.pathname === "/";
  const bgUrl = couple?.background_image_url;
  const push = usePushSubscription(profile?.id);

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
  const shellStyle =
    bgUrl && !isMap
      ? ({
          backgroundImage: `linear-gradient(rgba(255,255,255,0.16), rgba(255,255,255,0.36)), url(${getImageUrl(
            bgUrl,
            1200,
          )})`,
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

  if (loading) return <div className="full-center muted">Loading…</div>;

  if (error) {
    return (
      <div
        className="full-center"
        style={{ flexDirection: "column", padding: 24, textAlign: "center" }}
      >
        <h2>Something went wrong</h2>
        <p className="muted" style={{ maxWidth: 420 }}>
          {error}
        </p>
        <p className="muted small">
          Đã chạy <code>supabase/schema.sql</code> trong Supabase SQL Editor
          chưa?
        </p>
      </div>
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

  if (authLoading) return <div className="full-center muted">Loading…</div>;

  // Show reset password page when user clicked recovery link
  if (isRecovery && user) {
    return (
      <Routes>
        <Route path="*" element={<ResetPasswordPage />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <CoupleProvider userId={user.id}>
      <PinsScope />
    </CoupleProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
            <UpdatePrompt />
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
