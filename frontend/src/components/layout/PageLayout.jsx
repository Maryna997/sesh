import { Outlet } from 'react-router'

// Standard page padding (matches the Figma page margins: 22px mobile,
// 28px tablet, 72px desktop). Used as a nested route around regular pages.
//
// `compact` keeps less space under the header on tablet and desktop. It is
// used by the login and register pages, whose back arrow sits right below
// the header in the Figma frames. Mobile spacing is the same in both cases.
function PageLayout({ compact = false }) {
  const vertical = compact ? 'py-10 md:pt-4 lg:pt-4 lg:pb-16' : 'py-10 lg:py-16'

  return (
    <div className={`px-[22px] md:px-7 lg:px-[72px] ${vertical}`}>
      <Outlet />
    </div>
  )
}

export default PageLayout
