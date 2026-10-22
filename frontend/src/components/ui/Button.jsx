import { Link } from 'react-router'
import { LoaderCircle } from 'lucide-react'

// Visual styles for each variant, taken from Figma:
// - primary: blue call-to-action ("Log in", "Save availability")
// - secondary: soft pale fill (pale token used for selected chips/choices)
// - outline: white with a light border (landing "Log in" secondary CTA)
// - text: link-style action ("Forgot password?", "Cancel and go back")
// - danger: destructive action ("Permanently delete account")
const variantClasses = {
  primary: 'bg-blue text-white hover:bg-ink',
  secondary: 'bg-pale text-ink hover:bg-border',
  outline: 'border border-border bg-white text-teal hover:bg-card',
  text: 'text-link underline-offset-4 hover:underline',
  danger: 'bg-danger text-white hover:bg-danger-ink',
}

// Heights match the Figma buttons: 42px (default) and 47px (form CTAs).
const sizeClasses = {
  sm: 'h-9 px-3.5 text-xs',
  md: 'h-[42px] px-4 text-[13px]',
  lg: 'h-[47px] px-5 text-sm',
}

const iconSizes = { sm: 14, md: 16, lg: 18 }

// One button component for actions and links.
// - Pass `to` for an in-app route (React Router Link) or `href` for an external link.
// - `loading` shows a spinner and blocks clicks.
// - `icon` takes a lucide-react icon component, e.g. icon={MessageCircle}.
function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  to,
  href,
  loading = false,
  disabled = false,
  icon: Icon,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const isDisabled = disabled || loading

  const classes = [
    'inline-flex items-center justify-center gap-2 rounded-[10px] font-bold transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    className,
  ].join(' ')

  const content = (
    <>
      {loading ? (
        <LoaderCircle size={iconSizes[size]} className="animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon size={iconSizes[size]} aria-hidden="true" />
      )}
      {children}
      {loading && <span className="sr-only">(loading)</span>}
    </>
  )

  // A disabled link has no href, so it can't be followed or focused.
  if ((to || href) && isDisabled) {
    return (
      <a aria-disabled="true" className={classes} {...rest}>
        {content}
      </a>
    )
  }

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    )
  }

  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {content}
      </a>
    )
  }

  return (
    <button type={type} disabled={isDisabled} aria-busy={loading || undefined} className={classes} {...rest}>
      {content}
    </button>
  )
}

export default Button
