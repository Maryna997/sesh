import { Link } from 'react-router'
import Avatar from './Avatar'
import { AVAILABILITY } from '../../config/availability'

// Preview of a surfer, based on the Figma Discover "Surfer card":
//   [avatar]  Mariana Silva                    [side action]
//             Intermediate · Active now
//             Carcavelos · Shortboard
//   [footer]
//
// Props:
// - name, avatarUrl, level, spot, board: surfer details
// - status: ACTIVE | COMING_SOON | AT_SPOT | OFF
// - time: optional arrival time shown with the status ("Coming soon · 16:30")
// - to: optional route; makes the whole card a link to the surfer's profile
// - action: optional element in the bottom-right corner (e.g. a "Message" link)
// - sideAction: optional element on the right, vertically centred (Discover's
//   "Message" button)
// - footer: optional full-width content under the card's details (e.g. an error)
// - note: optional extra line under the spot (e.g. "Coming around 17:00")
//
// Actions are never inside the link: the link is the name, stretched over
// the card with a ::after layer, and actions sit above that layer
// (relative z-10), so each one is a separate control with its own focus.
// The card is a size container (@container), so its contents can adapt to
// the card's own width rather than the screen's.
function SurferCard({ name, avatarUrl, level, status, time, spot, board, note, to, action, sideAction, footer, className = '' }) {
  const statusLabel = AVAILABILITY[status]?.cardLabel
  const availability = [statusLabel, time].filter(Boolean).join(' · ')
  const details = [level, availability].filter(Boolean).join(' · ')
  const location = [spot, board].filter(Boolean).join(' · ')

  return (
    <article
      className={[
        '@container relative rounded-xl bg-card pt-[13px] pr-3 pb-4 pl-[17px]',
        to ? 'transition-colors hover:bg-pale' : '',
        className,
      ].join(' ')}
    >
      <div className="flex gap-3">
        <Avatar src={avatarUrl} name={name} decorative className="mt-[3px]" />

        <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
          <h3 className="truncate text-base font-bold text-ink">
            {to ? (
              // "Stretched link": the ::after layer covers the whole card,
              // so the full card is clickable but only the name is the link text.
              <Link
                to={to}
                className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-blue"
              >
                {name}
              </Link>
            ) : (
              name
            )}
          </h3>

          {details && <p className="text-xs text-muted">{details}</p>}

          {(location || action) && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {location && <p className="text-xs text-link">{location}</p>}
              {/* relative + z-10 keeps the action clickable above the stretched link */}
              {action && <div className="relative z-10 ml-auto">{action}</div>}
            </div>
          )}

          {note && <p className="text-xs text-muted">{note}</p>}
        </div>

        {sideAction && <div className="relative z-10 shrink-0 self-center">{sideAction}</div>}
      </div>

      {footer && <div className="relative z-10 mt-3">{footer}</div>}
    </article>
  )
}

export default SurferCard
