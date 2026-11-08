import { useId } from 'react'
import Alert from '../ui/Alert'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import StatusBadge from '../ui/StatusBadge'
import ProfileSummary from './ProfileSummary'
import { AVAILABILITY } from '../../config/availability'
import { formatArrival } from '../../utils/discoverCard'
import { spotNameWithArea } from '../../utils/publicProfile'
import { useStartConversation } from '../../hooks/useStartConversation'

// Another surfer's public profile, read-only, laid out like My Profile's
// panel so both pages look the same:
//   [82px avatar]  Name                      (My Profile: name + photo controls)
//                  [status] + what they shared
//   ProfileSummary rows: Surf level, Board, Favorite spots, About
//   [Message]                                (My Profile: "Edit profile")
//
// Empty optional details keep their row with a muted placeholder. This
// component only renders a loaded profile; loading and errors are the page's.

// What the surfer shared about today, in the space My Profile uses for the
// photo controls. Active spots are preferences, not destinations; "At the
// spot" is the surfer's own report. Off, expired or never set → not available.
function AvailabilitySummary({ availability }) {
  const status = availability?.status
  if (!status || status === 'OFF' || !AVAILABILITY[status]) {
    return <p className="mt-1 text-[11px] text-muted">Not currently available</p>
  }

  const spot = spotNameWithArea(availability.spot)
  let lines = []
  if (status === 'ACTIVE') {
    lines = [{ text: 'Open to a session today', muted: true }, { text: spot ? `Preferred spot: ${spot}` : 'No preferred spot' }]
  } else if (status === 'COMING_SOON') {
    lines = [{ text: spot ? `Heading to ${spot}` : '' }, { text: formatArrival(availability.arrival), muted: true }]
  } else if (status === 'AT_SPOT') {
    lines = [{ text: spot ? `At ${spot}` : '' }, { text: 'Shared by the surfer, not tracked by GPS', muted: true }]
  }

  return (
    <div className="mt-2">
      <StatusBadge status={status} size="sm" />
      <div className="mt-1.5 flex flex-col gap-0.5 text-[11px] break-words">
        {lines
          .filter((line) => line.text)
          .map((line) => (
            <p key={line.text} className={line.muted ? 'text-muted' : 'text-link'}>
              {line.text}
            </p>
          ))}
      </div>
    </div>
  )
}

function PublicProfileView({ profile }) {
  const baseId = useId()
  const message = useStartConversation()

  return (
    <>
      {/* Same header as My Profile (ProfilePhotoField without its controls) */}
      <section aria-labelledby={`${baseId}-name`} className="flex items-center gap-4">
        {/* The name is right next to the avatar, so it is not read twice */}
        <Avatar src={profile.avatarUrl} name={profile.displayName} size="xl" decorative />
        <div className="min-w-0 flex-1">
          <h2 id={`${baseId}-name`} className="text-xl font-bold break-words text-ink">
            {profile.displayName}
          </h2>
          <AvailabilitySummary availability={profile.availability} />
        </div>
      </section>

      {/* 44px, like My Profile's gap (its notice line + margins) */}
      <div className="mt-11">
        <ProfileSummary
          profile={profile}
          formatSpot={spotNameWithArea}
          emptySpotsText="No favorite spots added yet"
          aboutLabel="About"
        />

        {/* Where My Profile has "Edit profile": opens the conversation with
            this surfer (created or reused, see useStartConversation). */}
        <Button fullWidth className="mt-10" loading={message.pending} onClick={() => message.start(profile.userId)}>
          Message
        </Button>
        {message.error && (
          <Alert className="mt-3" title="We couldn’t open the conversation">
            {message.error}
          </Alert>
        )}
        <Button variant="text" size="sm" to="/discover" className="mt-3 w-full">
          Back to Discover
        </Button>
      </div>
    </>
  )
}

export default PublicProfileView
