import { Link } from 'react-router'
import { ChevronRight, KeyRound, Mail, Trash2 } from 'lucide-react'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import settingsImage from '../assets/profile-ocean.jpg'

// /settings: Settings & Privacy. The shared two-column layout (like My
// Profile) with a list of the account screens. Each row is one link
// (styled like the Messages inbox rows); Delete Account uses the danger colour.
const OPTIONS = [
  { to: '/settings/email', icon: Mail, title: 'Email Address', description: 'Change the email used to sign in.' },
  { to: '/settings/password', icon: KeyRound, title: 'Password', description: 'Update your password securely.' },
  {
    to: '/settings/delete-account',
    icon: Trash2,
    title: 'Delete Account',
    description: 'Permanently remove your account and profile.',
    danger: true,
  },
]

function SettingsPage() {
  return (
    <AuthPageLayout
      pageName="Settings & Privacy"
      image={settingsImage}
      heading="Settings & Privacy"
      description="Keep your account details up to date and secure."
    >
      <ul aria-label="Account settings" className="flex flex-col gap-[15px]">
        {OPTIONS.map(({ to, icon: Icon, title, description, danger }) => (
          <li key={to}>
            <Link
              to={to}
              className={[
                'flex min-h-[75px] items-center gap-4 rounded-xl border bg-white py-3 pr-3 pl-4 transition-colors',
                'hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
                danger ? 'border-danger-line' : 'border-border',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className={`flex size-10 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-danger-soft text-danger' : 'bg-pale text-teal'}`}
              >
                <Icon size={18} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`text-base font-bold ${danger ? 'text-danger-ink' : 'text-ink'}`}>{title}</span>
                <span className="text-[13px] text-muted">{description}</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink" />
            </Link>
          </li>
        ))}
      </ul>
    </AuthPageLayout>
  )
}

export default SettingsPage
