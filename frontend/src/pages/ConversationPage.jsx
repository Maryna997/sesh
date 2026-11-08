import AuthPageLayout from '../components/auth/AuthPageLayout'
import messagesImage from '../assets/messages-ocean.jpg'
import ComingSoon from '../components/ComingSoon'
import Button from '../components/ui/Button'

// /messages/:conversationId: one conversation, opened from the inbox.
// Placeholder until the chat (history, sending, polling) is built in
// Task 9.4: it loads nothing and shows no messages.
function ConversationPage() {
  return (
    <AuthPageLayout
      pageName="Messages"
      image={messagesImage}
      heading="Conversation"
      description="More spontaneity, more shared sessions"
      backTo="/messages"
      backLabel="Back to Messages"
    >
      <ComingSoon />
      <Button variant="outline" to="/messages" className="mt-6">
        Back to Messages
      </Button>
    </AuthPageLayout>
  )
}

export default ConversationPage
