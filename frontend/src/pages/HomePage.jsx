import LandingHero from '../components/landing/LandingHero'
import HowSeshWorks from '../components/landing/HowSeshWorks'

// Public landing page (/), from the Figma "Welcome / Public landing" frames.
// It is full-width (no PageLayout padding) so the hero image can reach
// the screen edges. The API health check moved to /dev/api-health.
function HomePage() {
  return (
    <>
      <LandingHero />

      <div className="px-[22px] pb-8 md:px-[38px] lg:px-[72px]">
        <HowSeshWorks className="mt-[15px] md:mt-5" />

        <p className="mt-[31px] text-[10px] text-muted md:mt-[33px] md:text-xs">
          No live GPS tracking required · You decide when you’re visible
        </p>
      </div>
    </>
  )
}

export default HomePage
