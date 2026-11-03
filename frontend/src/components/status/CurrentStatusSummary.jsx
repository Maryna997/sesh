import StatusBadge from '../ui/StatusBadge'
import { AVAILABILITY } from '../../config/availability'
import { formatLisbonTime, lisbonMinutesOfDay } from '../../utils/lisbonTime'

// The saved availability at the top of My Status, for each case:
// - none yet:  a short invitation to set a first status
// - available: status, spot, approximate arrival and until when
// - expired:   says it has ended (never shown as available)
// - off:       not visible as available; no old spot or arrival
// Times are Lisbon times (the API sends UTC instants).
//
// `state` is the current state worked out by the page (it also notices an
// expiry while the page stays open).

const untilText = (iso) => (lisbonMinutesOfDay(iso) === 0 ? 'midnight' : formatLisbonTime(iso))

function arrivalText(arrival) {
  if (arrival?.type === 'relative') return `Arriving around ${formatLisbonTime(arrival.arrivesAt)}`
  if (arrival?.type === 'window') {
    return `Arriving between ${formatLisbonTime(arrival.startsAt)} and ${formatLisbonTime(arrival.endsAt)}`
  }
  return null
}

function Card({ title, children }) {
  return (
    <section aria-labelledby="current-status-title" className="rounded-xl bg-card px-4 py-3.5 text-[13px] text-ink">
      <h2 id="current-status-title" className="text-[11px] font-bold tracking-wide text-muted uppercase">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function CurrentStatusSummary({ availability, state }) {
  if (!availability) {
    return (
      <Card title="Current status">
        <p className="font-bold">No status yet</p>
        <p className="mt-1 text-muted">Let other surfers know whether you’re up for a session today. Choose a status below and save it.</p>
      </Card>
    )
  }

  const label = AVAILABILITY[availability.status]?.label ?? availability.status

  if (state === 'off') {
    return (
      <Card title="Current status">
        <StatusBadge status="OFF" size="sm" />
        <p className="mt-2 text-muted">You’re not shown as available. Choose another status whenever you’d like to surf.</p>
      </Card>
    )
  }

  if (state === 'expired') {
    return (
      <Card title="Current status">
        <p className="font-bold">Your {label} status has ended</p>
        <p className="mt-1 text-muted">
          {availability.expiresAt ? `It ended at ${untilText(availability.expiresAt)}. ` : ''}You’re not shown as available.
          Choose a status below to be available again.
        </p>
      </Card>
    )
  }

  const spotName = availability.spot?.name
  const arrival = arrivalText(availability.arrival)
  return (
    <Card title="Current status">
      <StatusBadge status={availability.status} size="sm" />
      <ul className="mt-2 space-y-1">
        {spotName && <li>{availability.status === 'ACTIVE' ? `Preferred spot: ${spotName}` : spotName}</li>}
        {arrival && <li>{arrival}</li>}
        {availability.expiresAt && <li className="text-muted">Shown as available until {untilText(availability.expiresAt)}</li>}
      </ul>
    </Card>
  )
}

export default CurrentStatusSummary
