import PageIntro from '../components/PageIntro'

// Development-only page (/dev/member-header) that shows the signed-in
// header variant. It does not log anyone in: the dev route simply renders
// AppLayout with isAuthenticated, so the header can be reviewed before
// real authentication exists. Production builds don't include this route.
function MemberHeaderPreviewPage() {
  return (
    <PageIntro
      eyebrow="DEVELOPMENT ONLY"
      title="Signed-in header"
      description="Preview of the header surfers will see after logging in: Discover, Status, Messages and My profile, with the burger menu on mobile. The links lead to the regular pages, which show the visitor header."
    />
  )
}

export default MemberHeaderPreviewPage
