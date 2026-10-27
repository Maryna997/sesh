import { CircleAlert, CircleCheck } from 'lucide-react'

// Message box for form-level feedback.
// - error:   role="alert", announced immediately by screen readers
// - success: role="status", announced politely
// Colours come from the danger tokens (Delete Account frame) and the
// palette's green.
const variants = {
  error: {
    role: 'alert',
    icon: CircleAlert,
    classes: 'border-danger-line bg-danger-soft text-danger-ink',
  },
  success: {
    role: 'status',
    icon: CircleCheck,
    classes: 'border-border bg-green text-ink',
  },
}

function Alert({ variant = 'error', title, children, className = '', ...rest }) {
  const { role, icon: Icon, classes } = variants[variant]

  return (
    <div role={role} className={`flex gap-3 rounded-[10px] border px-4 py-3 text-[13px] ${classes} ${className}`} {...rest}>
      <Icon size={18} aria-hidden="true" className="mt-px shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
      </div>
    </div>
  )
}

export default Alert
