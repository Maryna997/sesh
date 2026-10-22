import { Outlet } from 'react-router'
import Header from './Header'

// Shared shell for every page: header on top, page content below.
// <Outlet /> is where React Router renders the page for the current URL.
// The main area has no padding of its own, so full-width pages like the
// landing hero can reach the screen edges; regular pages get their
// padding from PageLayout.
//
// `isAuthenticated` picks the header variant. It is false until real
// authentication exists (it will then come from the signed-in user).
function AppLayout({ isAuthenticated = false }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header isAuthenticated={isAuthenticated} />
      <main className="w-full flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
