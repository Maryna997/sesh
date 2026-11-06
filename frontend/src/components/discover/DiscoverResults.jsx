import { LoaderCircle, SearchX } from 'lucide-react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import DiscoverCard from './DiscoverCard'

export const NO_SURFERS_TITLE = 'No surfers are available right now'
export const NO_MATCHES_TITLE = 'No surfers match these filters'

function countText(total, shown) {
  const count = total === 1 ? '1 surfer available' : `${total} surfers available`
  return shown < total ? `${count} · showing ${shown}` : count
}

// The results part of Discover: loading, error, the two empty states, the
// list of cards and "Load more". `results` is the useDiscoverSurfers() value.
//
// - While a search runs (first load or after a filter change) only the
//   loading message is shown: earlier cards never stay on screen as if they
//   matched the new filters. The filters above stay usable.
// - One screen-reader status region stays on the page and its text changes
//   ("Finding surfers…", "3 surfers available", …); a region that appears
//   together with its text is often not announced. Errors use role="alert".
// - `regionRef` is the results area (focusable by script only). After
//   "Try again" or "Clear filters" the clicked button disappears, so focus is
//   moved here instead of being lost.
function DiscoverResults({ results, filtered, onClearFilters, duplicateNames, regionRef }) {
  const { status, surfers, total, hasMore, error, more, loadMore, retry } = results
  const isEmpty = status === 'ready' && surfers.length === 0

  let announcement = ''
  if (status === 'loading') announcement = 'Finding surfers…'
  else if (isEmpty) announcement = `${filtered ? NO_MATCHES_TITLE : NO_SURFERS_TITLE}.`
  else if (status === 'ready') announcement = more.status === 'loading' ? 'Loading more surfers…' : countText(total, surfers.length)

  function retrySearch() {
    retry()
    regionRef?.current?.focus()
  }

  let content
  if (status === 'loading') {
    content = (
      <p aria-hidden="true" className="flex items-center gap-3 py-6 text-sm text-muted">
        <LoaderCircle size={20} className="animate-spin text-teal" />
        Finding surfers…
      </p>
    )
  } else if (status === 'error') {
    content = (
      <div>
        <Alert title="We couldn’t load surfers">{error}</Alert>
        <Button variant="outline" className="mt-4" onClick={retrySearch}>
          Try again
        </Button>
      </div>
    )
  } else if (isEmpty) {
    content = filtered ? (
      <EmptyState
        icon={SearchX}
        title={NO_MATCHES_TITLE}
        description="Try another spot, level or time, or clear the filters to see everyone available."
        action={
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        title={NO_SURFERS_TITLE}
        description="Check back a bit later. You can also share your own status so others can find you."
        action={
          <Button variant="outline" to="/status">
            Set my status
          </Button>
        }
      />
    )
  } else {
    content = (
      <>
        <p aria-hidden="true" className="mb-4 text-[13px] text-muted">
          {countText(total, surfers.length)}
        </p>

        <ul aria-label="Available surfers" className="flex flex-col gap-4">
          {surfers.map((surfer) => (
            <li key={surfer.userId}>
              <DiscoverCard surfer={surfer} duplicateNames={duplicateNames} />
            </li>
          ))}
        </ul>

        {more.status === 'error' && (
          <Alert className="mt-4" title="We couldn’t load more surfers">
            {more.error}
          </Alert>
        )}

        {hasMore && (
          <Button variant="outline" fullWidth className="mt-4" loading={more.status === 'loading'} onClick={loadMore}>
            {more.status === 'loading' ? 'Loading more…' : more.status === 'error' ? 'Try again' : 'Load more'}
          </Button>
        )}

        <p className="mt-6 text-xs text-muted">Select a surfer to view their profile →</p>
      </>
    )
  }

  return (
    <div>
      {/* Outside the aria-busy section, so the loading message is not held back */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <section
        ref={regionRef}
        tabIndex={-1}
        aria-label="Search results"
        aria-busy={status === 'loading'}
        className="rounded-xl outline-none"
      >
        {content}
      </section>
    </div>
  )
}

export default DiscoverResults
