import PageIntro from '../components/PageIntro'
import ApiHealthCheck from '../components/ApiHealthCheck'

// Development-only page (/dev/api-health) that checks the frontend can
// reach the backend API. It used to live on the home page.
function ApiHealthPage() {
  return (
    <PageIntro
      eyebrow="DEVELOPMENT ONLY"
      title="API connection"
      description="Checks GET /api/v1/health on the backend set in VITE_API_URL."
    >
      <div className="mt-8 max-w-md">
        <ApiHealthCheck />
      </div>
    </PageIntro>
  )
}

export default ApiHealthPage
