import { useState } from 'react'
import { X } from 'lucide-react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import SurfSpotCombobox from '../ui/SurfSpotCombobox'
import { FAVORITE_SPOTS_LIMIT_MESSAGE, FAVORITE_SPOTS_MAX } from '../../utils/profileValidation'

// Favorite surf spots for the profile form: the Figma "Add a spot" search
// field (the existing SurfSpotCombobox) plus the chosen spots as removable
// chips below it.
//
// - `spots` is the list loaded from GET /api/v1/surf-spots.
// - `status` is 'loading', 'ready' or 'error' (loading the spots failed;
//   `onRetry` loads them again). Favorite spots are optional, so the rest of
//   the form keeps working in every state.
// - `value` is the list of chosen spot ids; onChange(ids) gets the new list.
// - Spots already chosen are left out of the search results, so a spot can't
//   be added twice. Picking a fourth spot is refused with a message.
function FavoriteSpotsPicker({ id, spots, status, value, onChange, onRetry, error }) {
  const [limitReached, setLimitReached] = useState(false)

  const chosenSpots = value.map((spotId) => spots.find((spot) => spot.id === spotId)).filter(Boolean)
  const availableSpots = spots.filter((spot) => !value.includes(spot.id))

  function addSpot(spotId) {
    if (!spotId) return // the field was cleared, nothing to add
    if (value.length >= FAVORITE_SPOTS_MAX) {
      setLimitReached(true)
      return
    }
    setLimitReached(false)
    onChange([...value, spotId])
  }

  function removeSpot(spotId) {
    setLimitReached(false)
    onChange(value.filter((chosenId) => chosenId !== spotId))
  }

  let helperText = `Choose up to ${FAVORITE_SPOTS_MAX} spots where you usually surf.`
  if (status === 'loading') helperText = 'Loading surf spots…'
  if (status === 'ready' && spots.length === 0) helperText = 'No surf spots are available yet.'

  const message = limitReached ? FAVORITE_SPOTS_LIMIT_MESSAGE : error

  return (
    <div>
      <SurfSpotCombobox
        id={id}
        label="Favorite surf spots"
        optional
        placeholder="Add a spot"
        spots={availableSpots}
        value={null}
        onChange={addSpot}
        disabled={status !== 'ready' || spots.length === 0}
        helperText={helperText}
        error={message}
      />

      {/* Announces the limit message right away; focus stays in the search field */}
      <p role="status" className="sr-only">
        {limitReached ? FAVORITE_SPOTS_LIMIT_MESSAGE : ''}
      </p>

      {status === 'error' && (
        <div className="mt-3">
          <Alert>We couldn’t load the surf spots. You can still save your profile and add spots later.</Alert>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      {chosenSpots.length > 0 && (
        <ul aria-label="Chosen favorite spots" className="mt-3 flex flex-wrap gap-2">
          {chosenSpots.map((spot) => (
            <li key={spot.id} className="flex max-w-full items-center gap-1 rounded-full bg-pale py-1 pr-1 pl-3 text-[13px] text-ink">
              <span className="truncate">{spot.name}</span>
              <button
                type="button"
                onClick={() => removeSpot(spot.id)}
                aria-label={`Remove ${spot.name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-teal hover:bg-border focus-visible:outline-2 focus-visible:outline-blue"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default FavoriteSpotsPicker
