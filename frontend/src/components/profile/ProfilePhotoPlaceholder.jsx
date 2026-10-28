import { UserRound } from 'lucide-react'
import Avatar from '../ui/Avatar'

// Takes the place of the Figma "Add your profile photo" tile until photo
// uploads exist (a later task). It is deliberately not a button, so it
// doesn't look like an upload that works. Shows the surfer's initials (the
// default avatar) as soon as they type a display name.
function ProfilePhotoPlaceholder({ displayName }) {
  const name = displayName.trim()

  return (
    <div className="flex min-h-20 items-center gap-4 rounded-xl bg-pale px-5 py-4">
      {name ? (
        <Avatar name={name} size="lg" decorative className="ring-2 ring-white" />
      ) : (
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-teal">
          <UserRound size={22} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-link">Profile photo</p>
        <p className="mt-1 text-[11px] text-muted">Photo uploads are coming soon. Your initials are shown for now.</p>
      </div>
    </div>
  )
}

export default ProfilePhotoPlaceholder
