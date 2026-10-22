import { AVAILABILITY } from '../../config/availability'

// Colors per status. Active (blue) and Coming Soon (pale) come from the
// Figma design-system chips; At the Spot uses the palette's green and
// Off uses a quiet outline so it reads as "not available".
const statusClasses = {
  ACTIVE: 'bg-blue text-white',
  COMING_SOON: 'bg-pale text-ink',
  AT_SPOT: 'bg-green text-ink',
  OFF: 'border border-line bg-white text-ink',
}

const sizeClasses = {
  sm: 'h-6 gap-1 px-2.5 text-[11px]',
  md: 'h-8 gap-1.5 px-3 text-xs',
}

// Pill showing a surfer's availability status.
// `status` is one of ACTIVE, COMING_SOON, AT_SPOT, OFF.
function StatusBadge({ status, size = 'md', className = '' }) {
  const config = AVAILABILITY[status]
  if (!config) return null

  const Icon = config.icon
  const isActive = status === 'ACTIVE'

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold whitespace-nowrap ${statusClasses[status]} ${sizeClasses[size]} ${className}`}
    >
      <Icon
        size={size === 'sm' ? 10 : 12}
        aria-hidden="true"
        fill={isActive ? 'currentColor' : 'none'}
      />
      {config.label}
    </span>
  )
}

export default StatusBadge
