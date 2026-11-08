import { LoaderCircle, MessageCircle } from 'lucide-react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import ConversationItem from './ConversationItem'
import { useNow } from '../../hooks/useNow'

export const EMPTY_INBOX_TITLE = 'No conversations yet'

function countText(total, shown) {
  const count = total === 1 ? '1 conversation' : `${total} conversations`
  return shown < total ? `${count} · showing ${shown}` : count
}

// The inbox: loading, error, empty state, the conversation list and
// "Load more". `inbox` is the useConversations() value. Same patterns as
// Discover's results:
// - one screen-reader status region stays on the page and its text changes
//   ("Loading conversations…", "3 conversations"); errors use role="alert";
// - after "Try again" (which disappears when clicked) focus moves to the
//   inbox area instead of being lost.
function MessagesInbox({ inbox, currentUserId, regionRef }) {
  const { status, conversations, total, hasMore, error, more, loadMore, retry } = inbox
  const now = useNow() // keeps "10:24" / "Yesterday" correct while the page stays open
  const isEmpty = status === 'ready' && conversations.length === 0

  let announcement = ''
  if (status === 'loading') announcement = 'Loading conversations…'
  else if (isEmpty) announcement = `${EMPTY_INBOX_TITLE}.`
  else if (status === 'ready') announcement = more.status === 'loading' ? 'Loading more conversations…' : countText(total, conversations.length)

  function retryLoad() {
    retry()
    regionRef?.current?.focus()
  }

  let content
  if (status === 'loading') {
    content = (
      <p aria-hidden="true" className="flex items-center gap-3 py-6 text-sm text-muted">
        <LoaderCircle size={20} className="animate-spin text-teal" />
        Loading conversations…
      </p>
    )
  } else if (status === 'error') {
    content = (
      <div>
        <Alert title="We couldn’t load your messages">{error}</Alert>
        <Button variant="outline" className="mt-4" onClick={retryLoad}>
          Try again
        </Button>
      </div>
    )
  } else if (isEmpty) {
    content = (
      <EmptyState
        icon={MessageCircle}
        title={EMPTY_INBOX_TITLE}
        description="Find someone to share your next session with."
        action={
          <Button variant="outline" to="/discover">
            Discover surfers
          </Button>
        }
      />
    )
  } else {
    content = (
      <>
        <ul aria-label="Conversations" className="flex flex-col gap-[15px]">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <ConversationItem conversation={conversation} currentUserId={currentUserId} now={now} />
            </li>
          ))}
        </ul>

        {more.status === 'error' && (
          <Alert className="mt-4" title="We couldn’t load more conversations">
            {more.error}
          </Alert>
        )}

        {hasMore && (
          <Button variant="outline" fullWidth className="mt-4" loading={more.status === 'loading'} onClick={loadMore}>
            {more.status === 'loading' ? 'Loading more…' : more.status === 'error' ? 'Try again' : 'Load more'}
          </Button>
        )}
      </>
    )
  }

  return (
    <div>
      {/* Outside the aria-busy section, so the loading message is not held back */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <section
        ref={regionRef}
        tabIndex={-1}
        aria-label="Inbox"
        aria-busy={status === 'loading'}
        className="rounded-xl outline-none"
      >
        {content}
      </section>
    </div>
  )
}

export default MessagesInbox
