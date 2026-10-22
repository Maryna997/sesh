import { Circle, CircleDashed, Clock, Crosshair } from 'lucide-react'

// The four availability statuses a surfer can set.
// Keys match the values stored by the backend (ACTIVE, COMING_SOON, AT_SPOT, OFF).
// Labels come from the Figma "My Status" frames; cardLabel is the shorter text
// shown inside surfer cards on Discover ("Active now", "At the spot").
export const AVAILABILITY = {
  ACTIVE: {
    label: 'Active',
    cardLabel: 'Active now',
    description: 'Available to surf now.',
    icon: Circle,
  },
  COMING_SOON: {
    label: 'Coming Soon',
    cardLabel: 'Coming soon',
    description: 'Planning to arrive at your selected time.',
    icon: Clock,
  },
  AT_SPOT: {
    label: 'At the Spot',
    cardLabel: 'At the spot',
    description: 'Already at the surf spot.',
    icon: Crosshair,
  },
  OFF: {
    label: 'Invisible / Off',
    cardLabel: 'Invisible',
    description: "You won't appear in Discover while invisible.",
    icon: CircleDashed,
  },
}

export const AVAILABILITY_KEYS = Object.keys(AVAILABILITY)
