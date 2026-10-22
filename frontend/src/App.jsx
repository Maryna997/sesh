import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import AppLayout from './components/layout/AppLayout'
import PageLayout from './components/layout/PageLayout'
import HomePage from './pages/HomePage'
import RegisterPage from './pages/RegisterPage'
import LoginPage from './pages/LoginPage'
import DiscoverPage from './pages/DiscoverPage'
import StatusPage from './pages/StatusPage'
import MessagesPage from './pages/MessagesPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import NotFoundPage from './pages/NotFoundPage'

// Development-only pages. In a production build import.meta.env.DEV is
// false, so these pages (and their mock data) are left out of the bundle.
const UiPreviewPage = import.meta.env.DEV ? lazy(() => import('./dev/UiPreviewPage')) : null
const ApiHealthPage = import.meta.env.DEV ? lazy(() => import('./dev/ApiHealthPage')) : null
const MemberHeaderPreviewPage = import.meta.env.DEV ? lazy(() => import('./dev/MemberHeaderPreviewPage')) : null

// All routes share AppLayout (header + navigation). Until authentication
// exists, AppLayout shows the visitor header (Log in / Create account).
// The landing page (/) is full-width; every other page is wrapped in
// PageLayout, which adds the standard page padding.
function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />

        <Route element={<PageLayout />}>
          <Route path="register" element={<RegisterPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="status" element={<StatusPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          {UiPreviewPage && (
            <Route
              path="ui-preview"
              element={
                <Suspense fallback={null}>
                  <UiPreviewPage />
                </Suspense>
              }
            />
          )}
          {ApiHealthPage && (
            <Route
              path="dev/api-health"
              element={
                <Suspense fallback={null}>
                  <ApiHealthPage />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      {/* Dev-only preview of the signed-in header (no real login involved) */}
      {MemberHeaderPreviewPage && (
        <Route path="dev/member-header" element={<AppLayout isAuthenticated />}>
          <Route element={<PageLayout />}>
            <Route
              index
              element={
                <Suspense fallback={null}>
                  <MemberHeaderPreviewPage />
                </Suspense>
              }
            />
          </Route>
        </Route>
      )}
    </Routes>
  )
}

export default App
