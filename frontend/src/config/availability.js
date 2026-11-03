import { Circle, CircleDashed, Clock, Crosshair } from 'lucide-react'

// The four availability statuses a surfer can set.
// Keys are the values the API uses (ACTIVE, COMING_SOON, AT_SPOT, OFF).
// Labels follow the Figma "My Status" frames, except Off, which is simply
// "Off" (Figma's "Invisible / Off" was replaced in Task 7.4).
// cardLabel is the shorter text shown inside surfer cards on Discover.
export const AVAILABILITY = {
  ACTIVE: {
    label: 'Active',
    cardLabel: 'Active now',
    description: 'Open to surfing sometime today.',
    icon: Circle,
  },
  COMING_SOON: {
    label: 'Coming Soon',
    cardLabel: 'Coming soon',
    description: 'Planning to surf today.',
    icon: Clock,
  },
  AT_SPOT: {
    label: 'At the Spot',
    cardLabel: 'At the spot',
    description: 'Already at a surf spot.',
    icon: Crosshair,
  },
  OFF: {
    label: 'Off',
    cardLabel: 'Off',
    description: 'Not available for a surf session.',
    icon: CircleDashed,
  },
}

export const AVAILABILITY_KEYS = Object.keys(AVAILABILITY)

// "In about 30 minutes / 1 hour / 2 hours"
export const RELATIVE_ARRIVAL_OPTIONS = [
  { minutes: 30, label: 'In about 30 minutes' },
  { minutes: 60, label: 'In about 1 hour' },
  { minutes: 120, label: 'In about 2 hours' },
]

// Two-hour windows today, Lisbon time: 05:00–07:00 … 19:00–21:00
export const ARRIVAL_WINDOW_START_HOURS = [5, 7, 9, 11, 13, 15, 17, 19]
export const ARRIVAL_WINDOW_HOURS = 2
