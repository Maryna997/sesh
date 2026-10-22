import { useEffect, useState } from 'react'

// Returns the current time and refreshes it every minute, so time-based UI
// (like disabling past time slots) stays correct while the page is open.
// Pass `override` to use a fixed time instead (e.g. to simulate a time in
// /ui-preview); the clock is not started in that case.
export function useNow(override) {
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    if (override) return
    const timer = setInterval(() => setClock(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [override])

  return override ?? clock
}
