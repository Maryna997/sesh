import { Outlet } from 'react-router'
import Header from './Header'

// Shared shell for every page: header on top, page content below.
// <Outlet /> is where React Router renders the page for the current URL.
function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="w-full flex-1 px-[22px] py-10 md:px-7 lg:px-[72px] lg:py-16">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
