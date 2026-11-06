import SurferCard from '../ui/SurferCard'
import { cardSpotText, formatArrival, skillLevelLabel } from '../../utils/discoverCard'

// One Discover result, shown with the shared SurferCard (Figma "Surfer card"):
//   [avatar]  Mariana Silva
//             Intermediate · Coming soon
//             Carcavelos
//             Coming around 17:00            (Coming Soon only)
//
// Only the public card fields from the API are used. The user id is used
// for the link only and never shown. Active surfers' spot is labelled as a
// preference; At the Spot and Active never show an arrival time.
function DiscoverCard({ surfer, duplicateNames }) {
  const { availability } = surfer
  const isComingSoon = availability?.status === 'COMING_SOON'

  return (
    <SurferCard
      name={surfer.displayName}
      avatarUrl={surfer.avatarUrl}
      level={skillLevelLabel(surfer.skillLevel)}
      status={availability?.status}
      spot={cardSpotText(availability, duplicateNames)}
      note={isComingSoon ? formatArrival(availability.arrival) : undefined}
      to={`/surfers/${encodeURIComponent(surfer.userId)}`}
    />
  )
}

export default DiscoverCard
