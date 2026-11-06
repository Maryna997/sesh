import { useMemo, useState } from 'react'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import discoverImage from '../assets/hero-ocean.jpg'
import DiscoverFilters from '../components/discover/DiscoverFilters'
import DiscoverResults from '../components/discover/DiscoverResults'
import { useDiscoverSurfers } from '../hooks/useDiscoverSurfers'
import { useSurfSpots } from '../hooks/useSurfSpots'
import { duplicateSpotNames } from '../utils/discoverCard'
import { DEFAULT_FILTERS, hasActiveFilters } from '../utils/discoverFilters'

// /discover: surfers who are available right now, following the Figma
// "Discovery results" frames (shared two-column layout; the Figma photo is
// the same image as the landing hero). Filters at the top of the panel,
// cards below.
//
// - The backend does all filtering and paging (GET /api/v1/discover); a new
//   search starts on every filter change, from page 1.
// - Surf spots come from GET /api/v1/surf-spots; if they fail to load the
//   page still works without a spot filter.
function DiscoverPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const spots = useSurfSpots()
  const results = useDiscoverSurfers(filters)
  const duplicateNames = useMemo(() => duplicateSpotNames(spots.list), [spots.list])

  return (
    <AuthPageLayout
      pageName="Discovery results"
      image={discoverImage}
      heading="Available surfers"
      description="Explore who’s available for a session today."
    >
      <div className="flex flex-col gap-8">
        <DiscoverFilters filters={filters} onChange={setFilters} spots={spots} duplicateNames={duplicateNames} />
        <DiscoverResults
          results={results}
          filtered={hasActiveFilters(filters)}
          onClearFilters={() => setFilters(DEFAULT_FILTERS)}
          duplicateNames={duplicateNames}
        />
      </div>
    </AuthPageLayout>
  )
}

export default DiscoverPage
