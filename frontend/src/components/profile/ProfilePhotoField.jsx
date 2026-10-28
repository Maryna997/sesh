import { useId, useRef, useState } from 'react'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import { AVATAR_ACCEPT, validateAvatarFile } from '../../utils/avatarFile'

// Profile photo picker, shared by Create Profile and My Profile: the avatar
// (photo, or the surfer's initials), a title, and "Add / Change photo" and
// "Remove photo" buttons.
//
// - `imageUrl`: the photo to show (a local preview or the saved Cloudinary URL).
// - `onSelectFile(file)`: called with a valid JPEG/PNG/WebP of at most 5 MB.
//   Invalid files are refused here with a message and never passed on.
// - `onRemove()`: called by "Remove photo" (shown only when there is a photo).
// - `busy` disables the buttons and shows `busyLabel` (e.g. "Uploading photo…").
// - `error`: a message from the parent (e.g. a failed upload).
// - `framed`: the pale Figma "Add your profile photo" tile (Create Profile);
//   without it the avatar sits directly on the page (My Profile).
// - `avatarSize`: an Avatar size; Create Profile uses the responsive
//   "photoField", My Profile the fixed 82px "xl".
function ProfilePhotoField({
  displayName,
  imageUrl,
  title = 'Profile photo',
  optional = false,
  avatarSize = 'lg',
  framed = true,
  busy = false,
  busyLabel = 'Uploading photo…',
  error,
  onSelectFile,
  onRemove,
}) {
  const inputRef = useRef(null)
  const [fileError, setFileError] = useState(null)
  const helperId = useId()
  const errorId = useId()
  const hasPhoto = Boolean(imageUrl)
  const message = fileError ?? error

  function handleFileChange(event) {
    const [file] = event.target.files ?? []
    // Reset, so choosing the same file again still triggers a change
    event.target.value = ''
    if (!file) return
    const problem = validateAvatarFile(file)
    setFileError(problem ?? null)
    if (!problem) onSelectFile(file)
  }

  function handleRemove() {
    setFileError(null)
    onRemove()
  }

  return (
    // In the tile, the gap grows with the larger tablet/desktop avatar
    <div className={`flex items-center gap-4 ${framed ? 'min-h-20 rounded-xl bg-pale px-5 py-4 md:gap-5 lg:gap-6' : ''}`}>
      <Avatar
        src={imageUrl}
        name={displayName}
        size={avatarSize}
        decorative
        className={framed ? 'ring-2 ring-white' : ''}
      />

      <div className="min-w-0 flex-1">
        <p className={framed ? 'text-[15px] font-bold text-link' : 'text-xl font-bold break-words text-ink'}>
          {title}
          {optional && (
            <>
              {' '}
              <span className="text-xs font-normal text-muted">(Optional)</span>
            </>
          )}
        </p>
        <p id={helperId} className="mt-1 text-[11px] text-muted">
          JPEG, PNG or WebP, up to 5 MB.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          onChange={handleFileChange}
          aria-label={hasPhoto ? 'Change profile photo' : 'Add profile photo'}
          tabIndex={-1}
          hidden
        />

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Button
            variant="outline"
            size="sm"
            loading={busy}
            disabled={busy}
            aria-describedby={message ? `${helperId} ${errorId}` : helperId}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? busyLabel : hasPhoto ? 'Change photo' : 'Add photo'}
          </Button>
          {hasPhoto && !busy && (
            <Button variant="text" size="sm" onClick={handleRemove}>
              Remove photo
            </Button>
          )}
        </div>

        {message && (
          <p id={errorId} role="alert" className="mt-2 text-[11px] font-bold text-danger-ink">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

export default ProfilePhotoField
