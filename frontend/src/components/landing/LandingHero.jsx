import Button from '../ui/Button'
import heroImage from '../../assets/hero-ocean.jpg'

// Landing page hero, from the Figma "Welcome / Public landing" frames.
// The ocean photo sits behind the text, below the header. As in Figma it is
// shown at 27% opacity with a soft 28% white overlay, so the dark text on
// top stays readable while the surfers in the water remain visible.
function LandingHero() {
  return (
    <section aria-labelledby="landing-heading" className="relative isolate overflow-hidden bg-white">
      {/* Decorative background: alt="" because the text carries the meaning */}
      <img
        src={heroImage}
        alt=""
        className="absolute inset-0 -z-10 size-full object-cover object-center opacity-27"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-white/28" />

      <div className="flex min-h-[522px] flex-col px-[22px] pt-[34px] pb-[38px] md:min-h-[471px] md:px-[38px] md:pt-[73px] md:pb-[71px] lg:px-[72px] lg:pt-[85px] lg:pb-[41px]">
        <p className="text-xs font-bold text-teal">SURF TOGETHER · ON YOUR TERMS</p>

        <h1
          id="landing-heading"
          className="mt-[21px] max-w-[340px] text-[30px] leading-[1.2] font-bold text-ink md:mt-[22px] md:max-w-[650px] md:text-[44px] lg:max-w-[950px] lg:text-[58px]"
        >
          Find your people. Catch more waves.
        </h1>

        {/* Ink instead of Figma's light grey: grey text drops below 4.5:1 over
            the darker parts of the photo. */}
        <p className="mt-8 text-sm leading-[1.25] text-ink md:mt-4 md:max-w-[650px] md:text-[17px] lg:mt-[25px] lg:max-w-[690px] lg:text-[19px]">
          Whether you&apos;re planning your next session, heading to the beach, or already at the spot, Sesh
          helps you find surfers at your level who are ready to paddle out with you.
        </p>

        {/* Mobile: full-width buttons pushed to the bottom of the hero.
            Tablet and desktop: side by side under the text. */}
        <div className="mt-auto flex flex-col gap-3.5 pt-10 md:mt-[51px] md:flex-row md:gap-[17px] md:pt-0 lg:mt-5">
          <Button to="/register" variant="accent" size="xl" className="w-full md:w-[220px] lg:w-[238px]">
            Create account
          </Button>
          <Button to="/login" variant="outline" size="xl" className="w-full md:w-[174px] lg:w-[180px]">
            Log in
          </Button>
        </div>
      </div>
    </section>
  )
}

export default LandingHero
