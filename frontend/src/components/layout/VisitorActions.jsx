import Button from '../ui/Button'

// Header actions for visitors who are not signed in, following the
// logged-out header in the Figma landing frames: a teal "Log in" link
// and a teal "Create account" button on the right.
function VisitorActions() {
  return (
    <nav aria-label="Account" className="flex items-center gap-1 md:gap-3">
      <Button to="/login" variant="ghost">
        Log in
      </Button>
      <Button to="/register" variant="accent">
        Create account
      </Button>
    </nav>
  )
}

export default VisitorActions
