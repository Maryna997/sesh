import { Waves } from 'lucide-react'

// Friendly placeholder for empty lists ("No surfers at this spot yet").
// - icon: a lucide-react icon component (defaults to waves)
// - title, description: short explanation of why it's empty
// - action: optional element, usually a <Button>, to help the user move on
function EmptyState({ icon: Icon = Waves, title, description, action, className = '' }) {
  return (
    <section
      className={`flex flex-col items-center rounded-2xl bg-card px-6 py-10 text-center ${className}`}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-white text-teal">
        <Icon size={26} aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-[17px] font-bold text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </section>
  )
}

export default EmptyState
