import Avatar from '../ui/Avatar'

// The contact card at the top of the chat (Figma "Chat contact header"):
// the other surfer's photo or initials and name. The name is the page's
// <h1>; while the conversation loads (or can't be shown) it reads "Chat".
// Only public fields are shown, never the conversation id.
function ChatHeader({ participant, name }) {
  return (
    <div className="flex min-h-[90px] items-center gap-3 rounded-xl border border-border bg-card px-6 py-4">
      {participant ? (
        // The name is right next to the photo, so it isn't read twice
        <Avatar src={participant.avatarUrl} name={name} size="lg" decorative />
      ) : (
        <span aria-hidden="true" className="size-12 shrink-0 rounded-full bg-pale" />
      )}
      <h1 className="min-w-0 truncate text-lg text-ink">{participant ? name : 'Chat'}</h1>
    </div>
  )
}

export default ChatHeader
