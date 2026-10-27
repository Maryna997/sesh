import { Circle, Mail, Search, Settings, User } from 'lucide-react'

// Single source of truth for the app's main navigation.
// Both the tablet/desktop top nav and the mobile burger menu read from here,
// so adding or renaming a page only needs a change in one place.

// Short labels for the horizontal top navigation (tablet and desktop).
// The fourth item, "My profile", opens the account menu below (Figma
// "My profile / Account menu open" frames).
export const topNavItems = [
  { to: '/discover', label: 'Discover' },
  { to: '/status', label: 'Status' },
  { to: '/messages', label: 'Messages' },
]

// Links in the tablet/desktop account menu (followed by "Log out")
export const accountMenuItems = [
  { to: '/profile', label: 'My Profile' },
  { to: '/settings', label: 'Settings & Privacy' },
]

// Fuller list for the mobile burger menu. Icons are lucide-react components
// chosen to match the symbols used in the Figma menu.
export const menuNavItems = [
  { to: '/discover', label: 'Discover', icon: Search },
  { to: '/status', label: 'My Status', icon: Circle, iconProps: { size: 12, fill: 'currentColor' } },
  { to: '/messages', label: 'Messages', icon: Mail },
  { to: '/profile', label: 'My Profile', icon: User },
  { to: '/settings', label: 'Settings & Privacy', icon: Settings },
]
