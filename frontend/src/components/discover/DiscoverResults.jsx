import { LoaderCircle, SearchX } from 'lucide-react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import DiscoverCard from './DiscoverCard'

// The results part of Discover: loading, error, the two empty states, the
// list of cards and "Load more". `results` is the useDiscoverSurfers() value.
// Basic states only; their visual refinement is a later task.
function DiscoverResults({ results, filtered, onClearFilters, duplicateNames }) {
  const { status, surfers, total, hasMore, error, more, loadMore, retry } = results

  if (status === 'loading') {
    return (
      <p role="status" className="flex items-center gap-3 py-6 text-sm text-muted">
        <LoaderCircle size={20} className="animate-spin text-teal" aria-hidden="true" />
        Finding surfers…
      </p>
    )
  }

  if (status === 'error') {
    return (
      <div>
        <Alert title="We couldn’t load surfers">{error}</Alert>
        <Button variant="outline" className="mt-4" onClick={retry}>
          Try again
        </Button>
      </div>
    )
  }

  if (surfers.length === 0) {
    return filtered ? (
      <EmptyState
        icon={SearchX}
        title="No surfers match these filters"
        description="Try another spot, level or time, or clear the filters to see everyone available."
        action={
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        title="No surfers are available right now"
        description="Check back a bit later, or set your own status so others can find you."
        action={
          <Button variant="outline" to="/status">
            Set my status
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <p role="status" className="mb-4 text-[13px] text-muted">
        {total === 1 ? '1 surfer available' : `${total} surfers available`}
        {surfers.length < total && ` · showing ${surfers.length}`}
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
          {more.status === 'error' ? 'Try again' : 'Load more'}
        </Button>
      )}

      <p className="mt-6 text-xs text-muted">Select a surfer to view their profile →</p>
    </div>
  )
}

export default DiscoverResults
