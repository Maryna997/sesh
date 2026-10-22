import { ArrowRight } from 'lucide-react'
import PageIntro from '../components/PageIntro'
import ComingSoon from '../components/ComingSoon'
import Button from '../components/ui/Button'

// Placeholder for /login. Headings come from the Figma Login frame;
// the real form is built in the authentication task.
function LoginPage() {
  return (
    <PageIntro title="Welcome back" description="Log in to find your next surf buddy.">
      <ComingSoon />
      <Button to="/register" variant="text" className="mt-4 -ml-4">
        New to Sesh? Create an account <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </PageIntro>
  )
}

export default LoginPage
