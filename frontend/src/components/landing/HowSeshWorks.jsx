// "How Sesh works" card from the Figma landing frames.
// Step titles are Figma's; the one-line explanations under them describe
// what each step means, without implying GPS tracking or long-term planning.
const STEPS = [
  {
    number: '01',
    title: 'Choose your spot',
    description: 'Find the surf break where you want to go.',
  },
  {
    number: '02',
    title: 'Set your status',
    description: 'Let others know whether you’re active, coming soon or already at the spot.',
  },
  {
    number: '03',
    title: 'Find surfers at your level',
    description: 'Discover surfers at your chosen spot and arrange a session through messaging.',
  },
]

function HowSeshWorks({ className = '' }) {
  return (
    <section aria-labelledby="how-sesh-works" className={`rounded-[18px] bg-card px-[18px] pt-5 pb-6 md:pb-7 ${className}`}>
      <h2 id="how-sesh-works" className="text-[17px] font-bold text-ink md:text-xl">
        How Sesh works
      </h2>

      <ol className="mt-[17px] flex flex-col gap-[19px] md:mt-[14px] md:gap-[21px] lg:grid lg:grid-cols-3 lg:gap-8">
        {STEPS.map((step) => (
          <li key={step.number}>
            <p className="text-xs text-ink md:text-[15px]">
              {/* The <ol> already numbers the steps for screen readers */}
              <span aria-hidden="true" className="mr-2 tabular-nums">
                {step.number}
              </span>
              {step.title}
            </p>
            <p className="mt-1.5 pl-[22px] text-xs text-muted md:pl-[27px] md:text-[13px]">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default HowSeshWorks
