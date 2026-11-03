import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import statusImage from '../assets/status-ocean.jpg'
import CurrentStatusSummary from '../components/status/CurrentStatusSummary'
import StatusOptions from '../components/status/StatusOptions'
import ArrivalPicker from '../components/status/ArrivalPicker'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import SurfSpotCombobox from '../components/ui/SurfSpotCombobox'
import { createMyAvailability, getMyAvailability, updateMyAvailability } from '../api/availability'
import { getRequestErrorMessage, SERVER_ERROR_MESSAGE } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'
import { useNow } from '../hooks/useNow'
import { useSurfSpots } from '../hooks/useSurfSpots'
import {
  arrivalOptions,
  buildAvailabilityPayload,
  currentState,
  EMPTY_FORM,
  formFromAvailability,
  isArrivalPossible,
  isSameForm,
  SPOT_ALLOWED,
  validateAvailabilityForm,
} from '../utils/availabilityForm'

const STATUS_ERROR_ID = 'status-error'
const SPOT_FIELD_ID = 'status-spot'
const ARRIVAL_FIELD_ID = 'status-arrival'
const ARRIVAL_PASSED_MESSAGE = 'That time has passed. Choose another arrival time.'
export const CHANGED_ELSEWHERE_MESSAGE =
  'Your status was changed in another window or device. We’ve loaded the latest version: check your choice and save again.'
export const TIME_ZONE_NOTE = 'All times are shown in Portugal mainland time (Lisbon).'

// Longest delay setTimeout accepts; a later expiry is noticed by the
// minute clock instead
const MAX_TIMER_MS = 2 ** 31 - 1

// /status: My Status. Shows the saved availability and lets the surfer set a
// new one, following the Figma "Availability & session" frames (shared
// two-column layout, status cards, spot and arrival fields, Save button).
//
// - GET /api/v1/availability/me on load. No record yet → the first save is a
//   POST; afterwards (also when expired or Off) saves are a PUT.
// - Nothing is saved until "Save availability"; "Cancel" restores the saved
//   choices. The request only contains the fields the chosen status uses.
// - Times are Lisbon times. If the status expires while the page is open,
//   it stops being shown as available and the page asks the server again.
function StatusPage() {
  const { refreshSession } = useAuth()
  const now = useNow()
  const spots = useSurfSpots()

  const [load, setLoad] = useState({ status: 'loading', error: null })
  const [availability, setAvailability] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  // Errors found when Save was pressed (checked against the exact time of
  // the click, which can be newer than the minute clock used for display)
  const [saveErrors, setSaveErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false) // blocks double submits immediately

  // Shows a loaded availability. `resetForm` also fills the form with it
  // (first load); otherwise the surfer's unsaved choices are kept.
  const showLoaded = useCallback((saved, { resetForm }) => {
    setAvailability(saved)
    if (resetForm) setForm(formFromAvailability(saved, new Date()))
    setLoad({ status: 'ready', error: null })
  }, [])

  const showLoadError = useCallback((error) => setLoad({ status: 'error', error: getRequestErrorMessage(error) }), [])

  // Asks the server again, keeping the form (used after a conflict and when
  // the status expires while the page is open)
  const refetchAvailability = useCallback(
    () => getMyAvailability().then(({ availability: saved }) => showLoaded(saved, { resetForm: false })),
    [showLoaded],
  )

  useEffect(() => {
    let isCurrent = true
    getMyAvailability().then(
      ({ availability: saved }) => isCurrent && showLoaded(saved, { resetForm: true }),
      (error) => isCurrent && showLoadError(error),
    )
    return () => {
      isCurrent = false
    }
  }, [showLoaded, showLoadError])

  function retryLoad() {
    setLoad({ status: 'loading', error: null })
    getMyAvailability().then(({ availability: saved }) => showLoaded(saved, { resetForm: true }), showLoadError)
  }

  // When the saved status expires while the page is open, ask the server
  // again (it stays the authority). The minute clock already stops showing
  // it as available in the meantime.
  const expiresAt = availability?.state === 'available' ? availability.expiresAt : null
  useEffect(() => {
    if (!expiresAt) return undefined
    const delay = new Date(expiresAt).getTime() - Date.now()
    if (delay > MAX_TIMER_MS) return undefined
    const timer = setTimeout(() => {
      refetchAvailability().catch(() => {})
    }, Math.max(delay, 0) + 1000)
    return () => clearTimeout(timer)
  }, [expiresAt, refetchAvailability])

  const state = currentState(availability, now)
  const savedForm = formFromAvailability(availability, now)
  const hasChanges = !isSameForm(form, savedForm)
  const clientErrors = validateAvailabilityForm(form, now)

  // Errors show after a save attempt, then update live. A chosen arrival
  // that has passed while the page was open is flagged right away.
  function fieldError(field) {
    if (field === 'arrival' && form.arrival && !isArrivalPossible(form.arrival, now)) return ARRIVAL_PASSED_MESSAGE
    return (submitted && (clientErrors[field] || saveErrors[field])) || serverErrors[field]
  }

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setServerErrors((current) => ({ ...current, [field]: undefined }))
    setSaveErrors((current) => ({ ...current, [field]: undefined }))
    setNotice(null)
  }

  function cancelChanges() {
    setForm(savedForm)
    setSubmitted(false)
    setServerErrors({})
    setSaveErrors({})
    setFormError(null)
  }

  function focusField(field) {
    const id = { status: `status-option-${form.status || 'ACTIVE'}`, spotId: SPOT_FIELD_ID, arrival: ARRIVAL_FIELD_ID }[field]
    document.getElementById(id)?.focus()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (savingRef.current) return

    setSubmitted(true)
    setFormError(null)
    setNotice(null)
    setServerErrors({})

    const errors = validateAvailabilityForm(form, new Date())
    setSaveErrors(errors)
    const firstInvalid = ['status', 'spotId', 'arrival'].find((field) => errors[field])
    if (firstInvalid) return focusField(firstInvalid)

    const hasRecord = availability !== null
    savingRef.current = true
    setIsSaving(true)
    try {
      const save = hasRecord ? updateMyAvailability : createMyAvailability
      const { availability: saved } = await save(buildAvailabilityPayload(form))
      setAvailability(saved)
      setForm(formFromAvailability(saved, new Date()))
      setSubmitted(false)
      setNotice('Your availability has been saved.')
    } catch (error) {
      const status = error.kind === 'http' ? error.status : null
      if (status === 400 && error.fieldErrors) {
        const { status: statusError, spotId, arrival } = error.fieldErrors
        setServerErrors({ status: statusError, spotId, arrival })
        if (!statusError && !spotId && !arrival) setFormError(SERVER_ERROR_MESSAGE)
      } else if ((status === 409 && !hasRecord) || (status === 404 && hasRecord)) {
        // Created or removed elsewhere: load the latest record, keep the
        // surfer's choices, and the next save uses the right request
        await refetchAvailability().catch(() => {})
        setFormError(CHANGED_ELSEWHERE_MESSAGE)
      } else if (status === 401) {
        setFormError('Your session has ended. Please log in again.')
        refreshSession()
      } else {
        setFormError(getRequestErrorMessage(error))
      }
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  const isActive = form.status === 'ACTIVE'
  const showSpot = SPOT_ALLOWED.includes(form.status)
  let spotHelper = isActive ? 'You can leave this empty if you’re open to different spots.' : undefined
  if (spots.status === 'loading') spotHelper = 'Loading surf spots…'

  return (
    <AuthPageLayout
      pageName="Availability"
      image={statusImage}
      heading="Your surf availability"
      description="Set your availability and update or deactivate it any time."
    >
      {load.status === 'loading' && (
        <p role="status" className="flex items-center gap-3 text-sm text-muted">
          <LoaderCircle size={20} className="animate-spin text-teal" aria-hidden="true" />
          Loading your availability…
        </p>
      )}

      {load.status === 'error' && (
        <div>
          <Alert title="We couldn’t load your availability">{load.error}</Alert>
          <Button variant="outline" className="mt-4" onClick={retryLoad}>
            Try again
          </Button>
        </div>
      )}

      {load.status === 'ready' && (
        <form noValidate onSubmit={handleSubmit} aria-label="Set your availability" className="flex flex-col gap-6">
          <CurrentStatusSummary availability={availability} state={state} />

          {formError && <Alert>{formError}</Alert>}

          <StatusOptions
            value={form.status}
            onChange={(status) => setField('status', status)}
            error={fieldError('status')}
            errorId={STATUS_ERROR_ID}
          />

          {showSpot && (
            <div>
              <SurfSpotCombobox
                id={SPOT_FIELD_ID}
                label={isActive ? 'Preferred surf spot' : 'Surf spot'}
                optional={isActive}
                required={!isActive}
                placeholder={isActive ? 'Choose a preferred spot' : 'Choose a spot'}
                helperText={spotHelper}
                spots={spots.list}
                value={form.spotId}
                onChange={(spotId) => setField('spotId', spotId)}
                disabled={spots.status !== 'ready'}
                error={fieldError('spotId')}
              />
              {spots.status === 'error' && (
                <div className="mt-3">
                  <Alert>We couldn’t load the surf spots.</Alert>
                  <Button variant="outline" size="sm" className="mt-3" onClick={spots.retry}>
                    Try again
                  </Button>
                </div>
              )}
            </div>
          )}

          {form.status === 'COMING_SOON' && (
            <ArrivalPicker
              id={ARRIVAL_FIELD_ID}
              label="Approximate arrival time"
              required
              placeholder="Choose when you’ll arrive"
              groups={arrivalOptions(now)}
              helperText={TIME_ZONE_NOTE}
              value={form.arrival}
              onChange={(arrival) => setField('arrival', arrival)}
              error={fieldError('arrival')}
            />
          )}

          <div className="mt-2 flex flex-col gap-3">
            <Button type="submit" size="lg" fullWidth loading={isSaving}>
              {isSaving ? 'Saving…' : 'Save availability'}
            </Button>
            {hasChanges && (
              <Button variant="outline" fullWidth onClick={cancelChanges} disabled={isSaving}>
                Cancel
              </Button>
            )}
            <p role="status" className="min-h-4 text-center text-[12px] text-teal">
              {notice}
            </p>
          </div>
        </form>
      )}
    </AuthPageLayout>
  )
}

export default StatusPage
