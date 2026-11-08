import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import Avatar from '../ui/Avatar'
import { formatInboxTime } from '../../utils/messageTime'

// One row of the inbox, as in the Figma "Messages / Inbox" frames:
//   [avatar]  Mariana Silva                 10:24
//             Let's catch some waves!          ›
// The whole row is one link to the conversation (no nested controls).
// The time is the last message's, or when the conversation was started.
// Only public fields are shown; ids are used for the link only.
function ConversationItem({ conversation, currentUserId, now }) {
  const { otherParticipant, lastMessage } = conversation
  const name = otherParticipant?.displayName || 'Sesh surfer'
  const time = lastMessage?.createdAt ?? conversation.createdAt
  const fromMe = lastMessage && lastMessage.senderId === currentUserId

  return (
    <Link
      to={`/messages/${encodeURIComponent(conversation.id)}`}
      className={[
        'flex min-h-[75px] items-center gap-3 rounded-xl border border-border bg-white py-3 pr-3 pl-4 transition-colors',
        'hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
      ].join(' ')}
    >
      {/* The name is right next to the avatar, so it isn't read twice */}
      <Avatar src={otherParticipant?.avatarUrl} name={name} decorative />

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-base font-bold text-ink">{name}</span>
          <time dateTime={new Date(time).toISOString()} className="shrink-0 text-[11px] text-ink">
            {formatInboxTime(time, now)}
          </time>
        </span>
        {lastMessage ? (
          <span className="truncate text-[13px] text-muted">
            {fromMe && <span className="text-ink">You: </span>}
            {lastMessage.preview}
          </span>
        ) : (
          <span className="truncate text-[13px] text-muted italic">No messages yet</span>
        )}
      </span>

      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink" />
    </Link>
  )
}

export default ConversationItem
