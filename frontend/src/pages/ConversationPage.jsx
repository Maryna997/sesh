import { useParams } from 'react-router'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import messagesImage from '../assets/messages-ocean.jpg'
import ChatView from '../components/messages/ChatView'

// /messages/:conversationId: one conversation (Figma "Chat / Conversation"
// frames): the shared two-column layout with the Messages photo, and the chat
// in the panel (contact header, history, composer). The back arrow leads to
// the inbox. Works when opened directly or after a refresh: everything is
// loaded from the conversation id in the URL.
//
// key={conversationId}: opening another conversation mounts a fresh chat, so
// no message, timer or request of the previous one can show up in it.
function ConversationPage() {
  const { conversationId } = useParams()

  return (
    <AuthPageLayout pageName="Chat" image={messagesImage} backTo="/messages" backLabel="Back to Messages">
      <ChatView key={conversationId} conversationId={conversationId} />
    </AuthPageLayout>
  )
}

export default ConversationPage
