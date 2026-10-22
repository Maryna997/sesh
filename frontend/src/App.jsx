import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import AppLayout from './components/layout/AppLayout'
import HomePage from './pages/HomePage'
import DiscoverPage from './pages/DiscoverPage'
import StatusPage from './pages/StatusPage'
import MessagesPage from './pages/MessagesPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import NotFoundPage from './pages/NotFoundPage'

// Component showcase for development only. In a production build
// import.meta.env.DEV is false, so this page (and its mock images)
// is left out of the bundle entirely.
const UiPreviewPage = import.meta.env.DEV ? lazy(() => import('./dev/UiPreviewPage')) : null

// All routes share AppLayout (header + navigation).
// Each child route's page is rendered inside the layout's <Outlet />.
function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
