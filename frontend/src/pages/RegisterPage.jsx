import { ArrowRight } from 'lucide-react'
import PageIntro from '../components/PageIntro'
import ComingSoon from '../components/ComingSoon'
import Button from '../components/ui/Button'

// Placeholder for /register. Headings come from the Figma Register frame;
// the real form is built in the authentication task.
function RegisterPage() {
  return (
    <PageIntro title="Create your account" description="Join the surf community in minutes.">
      <ComingSoon />
      <Button to="/login" variant="text" className="mt-4 -ml-4">
        Already have an account? Log in <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </PageIntro>
  )
}

export default RegisterPage
