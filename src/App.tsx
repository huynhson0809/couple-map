import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { LoginPage } from './components/auth/LoginPage'
import { RegisterPage } from './components/auth/RegisterPage'
import { CoupleSetup } from './components/auth/CoupleSetup'
import { MapPage } from './pages/MapPage'
import { TimelinePage } from './pages/TimelinePage'
import { StatsPage } from './pages/StatsPage'
import { WishlistPage } from './pages/WishlistPage'
import { SettingsPage } from './pages/SettingsPage'
import { BottomNav } from './components/ui/BottomNav'
import { useAuth } from './hooks/useAuth'
import { CoupleProvider, useCoupleCtx } from './hooks/CoupleContext'
import { PinsProvider } from './hooks/PinsContext'
import { ThemeProvider } from './hooks/ThemeContext'
import { I18nProvider } from './hooks/I18nContext'

function PairedShell() {
  const { couple, profile } = useCoupleCtx()
  const location = useLocation()
  const isMap = location.pathname === '/'
  return (
    <PinsProvider coupleId={couple?.id} userId={profile?.id}>
      <div className={`app-shell ${isMap ? 'shell-map' : 'shell-page'}`}>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
      </div>
    </PinsProvider>
  )
}

function RoutedShell() {
  const { couple, loading, error } = useCoupleCtx()

  if (loading) return <div className="full-center muted">Loading…</div>

  if (error) {
    return (
      <div
        className="full-center"
        style={{ flexDirection: 'column', padding: 24, textAlign: 'center' }}
      >
        <h2>Something went wrong</h2>
        <p className="muted" style={{ maxWidth: 420 }}>
          {error}
        </p>
        <p className="muted small">
          Đã chạy <code>supabase/schema.sql</code> trong Supabase SQL Editor chưa?
        </p>
      </div>
    )
  }

  const paired = !!couple && !!couple.user_b
  if (!paired) {
    return (
      <Routes>
        <Route path="/setup" element={<CoupleSetup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }

  return <PairedShell />
}

function AppRoutes() {
  const { user, loading: authLoading } = useAuth()

  if (authLoading) return <div className="full-center muted">Loading…</div>

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <CoupleProvider userId={user.id}>
      <RoutedShell />
    </CoupleProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  )
}
