import Avatar from '../ui/Avatar'
import { formatMessageTime } from '../../utils/messageTime'

// One message, as in the Figma chat frames:
// - received: on the left, white bubble, the sender's 36px photo or initials
// - sent (mine): on the right, light blue bubble
// The text is rendered as plain React text (never HTML or Markdown), keeps
// its line breaks, and long words or links wrap instead of overflowing.
// Screen readers hear "You: …" or "<name>: …", then the time.
function MessageBubble({ message, fromMe, name, avatarUrl, now }) {
  const sentAt = new Date(message.createdAt)
  const dateTime = Number.isNaN(sentAt.getTime()) ? undefined : sentAt.toISOString()

  return (
    <li data-message-id={message.id} className={`flex items-end gap-2 ${fromMe ? 'justify-end' : 'justify-start'}`}>
      {!fromMe && <Avatar src={avatarUrl} name={name} size="sm" decorative />}
      <div
        className={[
          'max-w-[85%] min-w-0 rounded-[13px] border border-border px-3.5 py-2.5 text-[13px] text-ink md:max-w-[75%]',
          fromMe ? 'bg-bubble-sent' : 'bg-white',
        ].join(' ')}
      >
        <span className="sr-only">{fromMe ? 'You' : name}: </span>
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>
        <time
          dateTime={dateTime}
          className={`mt-1 block text-[11px] ${fromMe ? 'text-right text-ink' : 'text-muted'}`}
        >
          {formatMessageTime(message.createdAt, now)}
        </time>
      </div>
    </li>
  )
}

export default MessageBubble
