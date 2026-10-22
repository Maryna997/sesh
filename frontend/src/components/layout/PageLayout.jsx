import { Outlet } from 'react-router'

// Standard page padding (matches the Figma page margins: 22px mobile,
// 28px tablet, 72px desktop). Used as a nested route around regular pages.
function PageLayout() {
  return (
    <div className="px-[22px] py-10 md:px-7 lg:px-[72px] lg:py-16">
      <Outlet />
    </div>
  )
}

export default PageLayout
