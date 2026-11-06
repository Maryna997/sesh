import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Select from '../ui/Select'
import SurfSpotCombobox from '../ui/SurfSpotCombobox'
import { spotLabel } from '../../utils/discoverCard'
import { ARRIVAL_FILTER_OPTIONS, SKILL_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from '../../utils/discoverFilters'

// The Discover filters, laid out like the Figma frames: a full-width
// searchable surf spot field ("All spots" by default), then compact
// "label [value ▾]" native selects that wrap on narrow screens.
//
// Controlled: `filters` ({ spotId, skillLevel, status, arrival }) and
// `onChange(nextFilters)`. "Approximate arrival" only exists for Coming
// Soon; changing the status always resets it to "Any time today", so a
// hidden arrival choice is never applied later.
// `spots` is the useSurfSpots() result ({ status, list, retry }).
function DiscoverFilters({ filters, onChange, spots, duplicateNames }) {
  function set(field, value) {
    if (filters[field] === value) return // same choice again: no new search
    const next = { ...filters, [field]: value }
    if (field === 'status') next.arrival = 'any'
    onChange(next)
  }

  return (
    <div role="group" aria-label="Filters" className="flex flex-col gap-5">
      <div>
        {/* The searchable spot field shared with My Status and the profile
            forms. Typing only searches the loaded spots; the filter (and the
            Discover request) changes when a spot or "All spots" is picked,
            or the field is cleared. */}
        <SurfSpotCombobox
          label="Surf spot"
          placeholder={spots.status === 'loading' ? 'Loading surf spots…' : 'All spots'}
          noSpotLabel="All spots"
          keepSelectionWhileTyping
          getSpotLabel={(spot) => spotLabel(spot, duplicateNames)}
          spots={spots.list}
          value={filters.spotId || null}
          onChange={(spotId) => set('spotId', spotId ?? '')}
          disabled={spots.status !== 'ready'}
        />
        {spots.status === 'error' && (
          <div className="mt-3">
            <Alert>We couldn’t load the surf spots. You can still search all spots.</Alert>
            {/* Named apart from the results' "Try again" */}
            <Button variant="outline" size="sm" className="mt-3" onClick={spots.retry}>
              Reload surf spots
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <Select
          variant="filter"
          label="Skill level"
          options={SKILL_FILTER_OPTIONS}
          value={filters.skillLevel}
          onChange={(event) => set('skillLevel', event.target.value)}
        />
        <Select
          variant="filter"
          label="Availability"
          options={STATUS_FILTER_OPTIONS}
          value={filters.status}
          onChange={(event) => set('status', event.target.value)}
        />
        {filters.status === 'COMING_SOON' && (
          <Select
            variant="filter"
            label="Approximate arrival"
            options={ARRIVAL_FILTER_OPTIONS}
            value={filters.arrival}
            onChange={(event) => set('arrival', event.target.value)}
          />
        )}
      </div>
    </div>
  )
}

export default DiscoverFilters
