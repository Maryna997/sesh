import { useRef } from 'react'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import messagesImage from '../assets/messages-ocean.jpg'
import MessagesInbox from '../components/messages/MessagesInbox'
import { useAuth } from '../auth/useAuth'
import { useConversations } from '../hooks/useConversations'

// /messages: the inbox, following the Figma "Messages / Inbox" frames (shared
// two-column layout with the page's own photo; conversation rows in the
// panel). Figma's "Search messages" field is not part of the MVP.
//
// GET /api/v1/conversations when the page opens (no polling here); each row
// opens /messages/:conversationId.
function MessagesPage() {
  const { user } = useAuth()
  const inbox = useConversations()
  const regionRef = useRef(null)

  return (
    <AuthPageLayout
      pageName="Messages"
      image={messagesImage}
      heading="Messages"
      description="More spontaneity, more shared sessions"
    >
      <MessagesInbox inbox={inbox} currentUserId={user?.id} regionRef={regionRef} />
    </AuthPageLayout>
  )
}

export default MessagesPage
