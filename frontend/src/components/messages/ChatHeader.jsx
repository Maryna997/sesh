import { Link } from 'react-router'
import Avatar from '../ui/Avatar'
import DeletedAccountAvatar, { DELETED_ACCOUNT_NAME } from './DeletedAccountAvatar'

export const DELETED_ACCOUNT_NOTE = 'This surfer is no longer on Sesh.'

const cardClasses = 'flex min-h-[90px] items-center gap-3 rounded-xl border border-border bg-card px-6 py-4'

// The contact card at the top of the chat (Figma "Chat contact header"):
// the other surfer's photo or initials and name. The name is the page's <h1>;
// while the conversation loads (or can't be shown) it reads "Chat".
// - Active surfer: the whole card is ONE link to their public profile
//   (/surfers/:userId, the id from the server's conversation data), with
//   hover and focus styles. Nothing else inside is interactive.
// - Deleted account (the server says the conversation is inactive): a
//   neutral placeholder, "Deleted account" and a short note; not a link.
// Only public fields are shown, never the conversation id.
function ChatHeader({ participant, name, deleted = false }) {
  if (deleted) {
    return (
      <div className={cardClasses}>
        <DeletedAccountAvatar size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-lg text-ink">{DELETED_ACCOUNT_NAME}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{DELETED_ACCOUNT_NOTE}</p>
        </div>
      </div>
    )
  }

  if (participant?.userId) {
    return (
      <Link
        to={`/surfers/${encodeURIComponent(participant.userId)}`}
        className={`${cardClasses} transition-colors hover:bg-pale focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue`}
      >
        {/* The name is right next to the photo, so it isn't read twice */}
        <Avatar src={participant.avatarUrl} name={name} size="lg" decorative />
        <h1 className="min-w-0 truncate text-lg text-ink">{name}</h1>
        <span className="sr-only">, view profile</span>
      </Link>
    )
  }

  return (
    <div className={cardClasses}>
      {participant ? (
        <Avatar src={participant.avatarUrl} name={name} size="lg" decorative />
      ) : (
        <span aria-hidden="true" className="size-12 shrink-0 rounded-full bg-pale" />
      )}
      <h1 className="min-w-0 truncate text-lg text-ink">{participant ? name : 'Chat'}</h1>
    </div>
  )
}

export default ChatHeader
