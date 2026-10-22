import { useRef, useState } from 'react'
import { ArrowRight, MessageCircle, Search, SearchX } from 'lucide-react'
import PageIntro from '../components/PageIntro'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import Select from '../components/ui/Select'
import Avatar from '../components/ui/Avatar'
import StatusBadge from '../components/ui/StatusBadge'
import SurferCard from '../components/ui/SurferCard'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import SurfSpotCombobox from '../components/ui/SurfSpotCombobox'
import TimeFilter from '../components/ui/TimeFilter'
import { AVAILABILITY, AVAILABILITY_KEYS } from '../config/availability'
import { SURFBOARD_OPTIONS } from '../config/surfboards'
import { DEFAULT_TIME_FILTER } from '../config/discoverTime'
import { getSurfSpotById } from '../data/surfSpots'
import { validateEmail, validatePassword } from '../utils/validation'
import { levelOptions, mockSurfers } from './mockSurfers'

// Development-only showcase of the Sesh UI components (/ui-preview).
// It is registered only in `npm run dev` and is not linked from the navigation.

const statusOptions = AVAILABILITY_KEYS.map((key) => ({ value: key, label: AVAILABILITY[key].label }))

const simulatedTimeOptions = [
  { value: 'real', label: 'Real local time' },
  { value: '08:00', label: '08:00 (all slots open)' },
  { value: '14:10', label: '14:10 (morning slots passed)' },
  { value: '21:00', label: '21:00 (all slots passed)' },
]

function PreviewSection({ title, description, children }) {
  return (
    <section className="rounded-[20px] bg-white p-5 md:p-8" aria-labelledby={`preview-${title}`}>
      <h2 id={`preview-${title}`} className="text-xl font-bold text-ink md:text-[22px]">
        {title}
      </h2>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </section>
  )
}

function Row({ label, children }) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-bold tracking-wide text-teal uppercase">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

// Shows a value the parent receives, e.g. the selected spot id.
function ValueReadout({ label, children }) {
  return (
    <p className="rounded-lg bg-card px-3 py-2 text-xs text-ink">
      {label}: <code className="font-bold break-all">{children}</code>
    </p>
  )
}

// Email field that validates on blur, then live while the user corrects it.
// `showErrorInitially` demonstrates the error state without interaction.
function EmailExample({ label, initialValue = '', required = false, showErrorInitially = false, helperText }) {
  const [value, setValue] = useState(initialValue)
  const [touched, setTouched] = useState(showErrorInitially)
  const error = touched ? validateEmail(value, { required }) : undefined

  return (
    <Input
      label={label}
      type="email"
      placeholder="you@example.com"
      autoComplete="email"
      required={required}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => setTouched(true)}
      error={error}
      helperText={helperText}
    />
  )
}

// Form-level validation: errors appear on submit and focus moves to the field.
function EmailFormExample() {
  const inputRef = useRef(null)
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const error = submitted ? validateEmail(value, { required: true }) : undefined

  function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (validateEmail(value, { required: true })) inputRef.current?.focus()
  }

  return (
    // noValidate: show our own accessible messages instead of browser pop-ups.
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-card p-5">
      <Input
        ref={inputRef}
        label="Email (checked on submit)"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={error}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Check email</Button>
        <p role="status" className="text-xs text-ink">
          {submitted && !error ? 'Looks good. (Nothing is sent — validation only.)' : ''}
        </p>
      </div>
    </form>
  )
}

// Password field validated on blur or on submit, then live while correcting.
// The password itself is never shown in debug output, logged or stored.
function PasswordFormExample() {
  const inputRef = useRef(null)
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const error = touched ? validatePassword(password, { required: true }) : undefined

  function handleSubmit(event) {
    event.preventDefault()
    setTouched(true)
    setSubmitted(true)
    if (validatePassword(password, { required: true })) inputRef.current?.focus()
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-card p-5">
      <PasswordInput
        ref={inputRef}
        label="Password"
        placeholder="At least 8 characters"
        autoComplete="new-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        onBlur={() => setTouched(true)}
        helperText="Use at least 8 characters. Spaces and passphrases are fine."
        error={error}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Check password</Button>
        <p role="status" className="text-xs text-ink">
          {submitted && !error ? 'Password meets the requirements. (Nothing is sent — validation only.)' : ''}
        </p>
      </div>
    </form>
  )
}

function UiPreviewPage() {
  const [isSaving, setIsSaving] = useState(false)
  const [level, setLevel] = useState('')
  const [board, setBoard] = useState('')
  const [spotId, setSpotId] = useState(null)
  const [favouriteSpotId, setFavouriteSpotId] = useState('pt-mafra-ribeira-dilhas')
  const [timeFilter, setTimeFilter] = useState(DEFAULT_TIME_FILTER)
  const [customTimeFilter, setCustomTimeFilter] = useState({ type: 'custom', day: 'tomorrow', time: '17:00' })
  const [simulatedTime, setSimulatedTime] = useState('real')
  const [simulatedNow, setSimulatedNow] = useState(undefined)
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deleteText, setDeleteText] = useState('')

  // Turn "14:10" into a Date for today, so the filter can be tested at any hour.
  function handleSimulatedTimeChange(event) {
    const choice = event.target.value
    setSimulatedTime(choice)

    if (choice === 'real') {
      setSimulatedNow(undefined)
      return
    }
    const [hours, minutes] = choice.split(':').map(Number)
    const date = new Date()
    date.setHours(hours, minutes, 0, 0)
    setSimulatedNow(date)
  }

  function simulateSave() {
    setIsSaving(true)
    setTimeout(() => setIsSaving(false), 1500)
  }

  function closeDeleteModal() {
    setIsDeleteOpen(false)
    setDeleteText('')
  }

  return (
    <div className="flex flex-col gap-8">
      <PageIntro
        eyebrow="DEVELOPMENT ONLY"
        title="UI components"
        description="Reusable Sesh components and their main states, shown with mock data."
      />

      <PreviewSection title="Button" description="Variants, sizes, states and links.">
        <Row label="Variants">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="text">Text</Button>
          <Button variant="danger">Danger</Button>
        </Row>
        <Row label="Sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </Row>
        <Row label="States">
          <Button icon={MessageCircle}>With icon</Button>
          <Button disabled>Disabled</Button>
          <Button loading={isSaving} onClick={simulateSave}>
            {isSaving ? 'Saving…' : 'Click to load'}
          </Button>
          <Button variant="outline" loading>
            Loading
          </Button>
        </Row>
        <Row label="As links">
          <Button to="/discover">Go to Discover</Button>
          <Button variant="outline" href="https://www.figma.com" target="_blank" rel="noreferrer">
            External link
          </Button>
          <Button to="/discover" disabled>
            Disabled link
          </Button>
        </Row>
        <div className="max-w-md">
          <Button size="lg" fullWidth>
            Save availability
          </Button>
        </div>
      </PreviewSection>

      <PreviewSection title="Input" description="Labels, helper text, validation and disabled state.">
        <div className="grid gap-5 md:grid-cols-2">
          <Input label="Name" placeholder="Your name" />
          <Input label="Surf spot" placeholder="Choose a spot" icon={Search} />
          <Input
            label="Password"
            type="password"
            placeholder="At least 8 characters"
            helperText="Use at least 8 characters."
          />
          <Input label="Confirmation" placeholder="DELETE" error="Type DELETE to confirm." />
          <Input label="Disabled" placeholder="Not editable" disabled />
        </div>
      </PreviewSection>

      <PreviewSection
        title="Email validation"
        description="Required + basic syntax check with validateEmail(). No account or backend check yet."
      >
        <div className="grid gap-5 md:grid-cols-3">
          <EmailExample
            label="Valid email"
            initialValue="mariana@example.com"
            required
            showErrorInitially
            helperText="Valid, so no error is shown."
          />
          <EmailExample label="Invalid email" initialValue="mariana@example" required showErrorInitially />
          <EmailExample label="Empty required email" required showErrorInitially />
        </div>
        <EmailFormExample />
      </PreviewSection>

      <PreviewSection
        title="Password validation"
        description="validatePassword(): required + at least 8 characters. Errors appear after leaving the field or submitting, and clear as soon as the value is fixed."
      >
        <div className="max-w-md">
          <PasswordFormExample />
        </div>
      </PreviewSection>

      <PreviewSection title="Select" description="Native select as a form field and as a compact filter.">
        <div className="grid gap-5 md:grid-cols-2">
          <Select
            label="Surf level"
            placeholder="Choose a level"
            options={levelOptions}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            required
            helperText={level ? `Selected: ${level}` : 'Required field.'}
          />
          <Select label="Status" options={statusOptions} defaultValue="COMING_SOON" />
          <Select
            label="Board"
            placeholder="Choose a board"
            options={SURFBOARD_OPTIONS}
            value={board}
            onChange={(event) => setBoard(event.target.value)}
            required
            error={board ? undefined : 'Please choose a board.'}
            helperText={board ? `Stored value: ${board}` : undefined}
          />
          <Select label="Disabled" placeholder="Not available" options={[]} disabled />
        </div>
        <Row label="Filter variant (Discover)">
          <Select variant="filter" label="Level" placeholder="All" options={levelOptions} />
          <Select variant="filter" label="Status" placeholder="Any" options={statusOptions} />
        </Row>
      </PreviewSection>

      <PreviewSection
        title="SurfSpotCombobox"
        description="Search a sample of Portuguese surf spots. Try “cap”, “sao joao”, “ericeira” or “cabedelo”."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <SurfSpotCombobox
              value={spotId}
              onChange={(id) => setSpotId(id)}
              required
              helperText="Arrow keys to move, Enter to select, Escape to close or clear."
            />
            <ValueReadout label="Selected spot id">{spotId ?? 'none'}</ValueReadout>
            {spotId && <ValueReadout label="Spot">{getSurfSpotById(spotId)?.name}</ValueReadout>}
          </div>
          <div className="flex flex-col gap-5">
            <SurfSpotCombobox
              label="Favourite spot"
              value={favouriteSpotId}
              onChange={(id) => setFavouriteSpotId(id)}
              helperText="Starts with a selected spot."
            />
            <SurfSpotCombobox label="Disabled spot" disabled />
          </div>
        </div>
      </PreviewSection>

      <PreviewSection
        title="TimeFilter"
        description="Compact Discover time dropdown. “Choose date & time…” reveals the day + approximate time selector (DateTimeFilter). Past slots are disabled for Today."
      >
        <Row label="Discover filter bar">
          <Select variant="filter" label="Level" placeholder="All" options={levelOptions} />
          <Select variant="filter" label="Status" placeholder="Any" options={statusOptions} />
          <TimeFilter value={timeFilter} onChange={setTimeFilter} now={simulatedNow} />
        </Row>
        <ValueReadout label="Value">{JSON.stringify(timeFilter)}</ValueReadout>

        <Row label="Starting with a custom day and time">
          <TimeFilter label="When" value={customTimeFilter} onChange={setCustomTimeFilter} now={simulatedNow} />
        </Row>
        <ValueReadout label="Value">{JSON.stringify(customTimeFilter)}</ValueReadout>

        <div className="max-w-sm">
          <Select
            label="Simulate current time (preview only)"
            options={simulatedTimeOptions}
            value={simulatedTime}
            onChange={handleSimulatedTimeChange}
          />
        </div>
      </PreviewSection>

      <PreviewSection title="Avatar" description="Image, initials fallback and sizes.">
        <Row label="Sizes">
          <Avatar src={mockSurfers[0].avatarUrl} name="Mariana Silva" size="sm" />
          <Avatar src={mockSurfers[0].avatarUrl} name="Mariana Silva" size="md" />
          <Avatar src={mockSurfers[0].avatarUrl} name="Mariana Silva" size="lg" />
          <Avatar src={mockSurfers[3].avatarUrl} name="Emma Laurent" size="xl" />
        </Row>
        <Row label="Initials fallback">
          <Avatar name="Noah Pereira" size="sm" />
          <Avatar name="Noah Pereira" size="md" />
          <Avatar name="Noah Pereira" size="lg" />
          <Avatar name="Noah Pereira" size="xl" />
          <Avatar src="/missing-image.png" name="Broken Image" size="lg" />
        </Row>
      </PreviewSection>

      <PreviewSection title="StatusBadge" description="The four availability statuses.">
        <Row label="Medium">
          {AVAILABILITY_KEYS.map((key) => (
            <StatusBadge key={key} status={key} />
          ))}
        </Row>
        <Row label="Small">
          {AVAILABILITY_KEYS.map((key) => (
            <StatusBadge key={key} status={key} size="sm" />
          ))}
        </Row>
      </PreviewSection>

      <PreviewSection title="SurferCard" description="Surfer previews with mock data.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mockSurfers.map((surfer, index) => (
            <SurferCard
              key={surfer.id}
              {...surfer}
              to={index === 0 ? '/profile' : undefined}
              action={
                index === 1 ? (
                  <Button variant="text" size="sm" to="/messages">
                    Message <ArrowRight size={14} aria-hidden="true" />
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
        <p className="text-[11px] text-muted">
          First card links to a profile (whole card clickable). Second card has a Message action. The last one
          shows the initials fallback.
        </p>
      </PreviewSection>

      <PreviewSection title="EmptyState">
        <EmptyState
          icon={SearchX}
          title="No surfers here yet"
          description="Nobody has shared their plans for this spot. Try another spot or set your own status."
          action={
            <Button variant="outline" to="/status">
              Set my status
            </Button>
          }
        />
      </PreviewSection>

      <PreviewSection title="Modal" description="Escape, backdrop click and the close button all close it.">
        <Row label="Examples">
          <Button variant="outline" onClick={() => setIsInfoOpen(true)}>
            Open info modal
          </Button>
          <Button variant="danger" onClick={() => setIsDeleteOpen(true)}>
            Open confirm modal
          </Button>
        </Row>
      </PreviewSection>

      <Modal
        open={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        title="How Sesh works"
        description="Choose your spot, set your status and find surfers at your level."
        actions={<Button onClick={() => setIsInfoOpen(false)}>Got it</Button>}
      />

      <Modal
        open={isDeleteOpen}
        onClose={closeDeleteModal}
        title="Delete your Sesh account?"
        description="This action permanently removes your account and profile and cannot be undone."
        actions={
          <>
            <Button variant="text" onClick={closeDeleteModal}>
              Cancel and go back
            </Button>
            <Button variant="danger" disabled={deleteText !== 'DELETE'} onClick={closeDeleteModal}>
              Permanently delete account
            </Button>
          </>
        }
      >
        <Input
          label="Type DELETE to confirm"
          placeholder="DELETE"
          value={deleteText}
          onChange={(event) => setDeleteText(event.target.value)}
        />
      </Modal>
    </div>
  )
}

export default UiPreviewPage
