import { LoaderCircle, MessageCircle } from 'lucide-react'
import Alert from '../ui/Alert'
import SurferCard from '../ui/SurferCard'
import { useStartConversation } from '../../hooks/useStartConversation'
import { cardSpotText, formatArrival, skillLevelLabel } from '../../utils/discoverCard'

// One Discover result, shown with the shared SurferCard (Figma "Surfer card"):
//   [avatar]  Mariana Silva                 [💬 Message]
//             Intermediate · Coming soon
//             Carcavelos
//             Coming around 17:00            (Coming Soon only)
//
// Two separate actions: the card (its name link, stretched over the card)
// opens the surfer's profile; the Message button on the right opens the
// conversation with them (created or reused, see useStartConversation). The
// button is not inside the link, so clicking it never opens the profile.
//
// Message button: 44px tall (touch target), Sesh outline style. Its text is
// hidden when the card itself is narrower than 300px (a container query,
// so it follows the card's width, not the screen's); the accessible name is
// always "Message <name>".
//
// Only the public card fields from the API are used. The user id is used
// for the link and the conversation request only and never shown. Active
// surfers' spot is labelled as a preference; At the Spot and Active never
// show an arrival time.
function DiscoverCard({ surfer, duplicateNames }) {
  const { availability } = surfer
  const isComingSoon = availability?.status === 'COMING_SOON'
  const message = useStartConversation()

  const messageButton = (
    <button
      type="button"
      onClick={() => message.start(surfer.userId)}
      disabled={message.pending}
      aria-busy={message.pending || undefined}
      className={[
        'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-white px-0 text-xs font-bold text-teal transition-colors @min-[300px]:px-3',
        'hover:bg-pale focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
        'disabled:cursor-not-allowed disabled:opacity-60',
      ].join(' ')}
    >
      {message.pending ? (
        <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
      ) : (
        <MessageCircle size={16} aria-hidden="true" />
      )}
      <span className="sr-only @min-[300px]:not-sr-only">Message</span>
      {/* A space for the name "Message <name>" (not rendered between flex items) */}
      {' '}
      <span className="sr-only">{surfer.displayName}</span>
    </button>
  )

  return (
    <SurferCard
      name={surfer.displayName}
      avatarUrl={surfer.avatarUrl}
      level={skillLevelLabel(surfer.skillLevel)}
      status={availability?.status}
      spot={cardSpotText(availability, duplicateNames)}
      note={isComingSoon ? formatArrival(availability.arrival) : undefined}
      to={`/surfers/${encodeURIComponent(surfer.userId)}`}
      sideAction={messageButton}
      footer={
        message.error && (
          <Alert title="We couldn’t open the conversation">
            {message.error}
          </Alert>
        )
      }
    />
  )
}

export default DiscoverCard
