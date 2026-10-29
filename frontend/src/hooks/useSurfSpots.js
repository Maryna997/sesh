import { useCallback, useEffect, useState } from 'react'
import { getSurfSpots } from '../api/profile'

// Loads the surf spots; never throws, so a form works without them
function fetchSurfSpots() {
  return getSurfSpots().then(
    ({ spots }) => ({ status: 'ready', list: Array.isArray(spots) ? spots : [] }),
    () => ({ status: 'error', list: [] }),
  )
}

// The surf spots for the favorite spots picker (GET /api/v1/surf-spots).
// Returns { status: 'loading' | 'ready' | 'error', list, retry }.
export function useSurfSpots() {
  const [spots, setSpots] = useState({ status: 'loading', list: [] })

  useEffect(() => {
    let isCurrent = true
    fetchSurfSpots().then((result) => isCurrent && setSpots(result))
    return () => {
      isCurrent = false
    }
  }, [])

  const retry = useCallback(() => {
    setSpots({ status: 'loading', list: [] })
    fetchSurfSpots().then(setSpots)
  }, [])

  return { ...spots, retry }
}
