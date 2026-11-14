import { UserRound } from 'lucide-react'

export const DELETED_ACCOUNT_NAME = 'Deleted account'

// Neutral placeholder for a surfer who deleted their account (no photo, no
// initials: nothing about the person is kept). Same sizes as Avatar.
const sizeClasses = { sm: 'size-9', md: 'size-11', lg: 'size-12' }
const iconSizes = { sm: 16, md: 20, lg: 22 }

function DeletedAccountAvatar({ size = 'md', className = '' }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-line text-muted ${sizeClasses[size]} ${className}`}>
      <UserRound size={iconSizes[size]} />
    </span>
  )
}

export default DeletedAccountAvatar
