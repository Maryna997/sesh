// Page heading block used across Sesh pages:
// small blue eyebrow, large title and a muted description (as in Figma).
function PageIntro({ eyebrow = 'SESH  /  SURF COMMUNITY', title, description, children }) {
  return (
    <section className="max-w-[620px]">
      <p className="text-xs font-bold whitespace-pre-wrap text-blue">{eyebrow}</p>
      <h1 className="mt-6 text-[28px] font-bold text-ink md:text-[30px] lg:mt-8 lg:text-4xl">
        {title}
      </h1>
      {description && (
        <p className="mt-4 text-sm text-muted md:text-[15px] lg:mt-6 lg:text-[17px]">
          {description}
        </p>
      )}
      {children}
    </section>
  )
}

export default PageIntro
