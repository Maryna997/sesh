import { useState } from 'react'

// Sizes used in Figma: chat message (36), surfer card / inbox (44),
// chat header (48) and profile (82).
const sizeClasses = {
  sm: 'size-9 text-[13px]',
  md: 'size-11 text-[15px]',
  lg: 'size-12 text-base',
  xl: 'size-[82px] text-[26px]',
}

// "Mariana Silva" -> "MS", "Lee" -> "L"
function getInitials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}

// Round profile picture. Falls back to the person's initials when there is
// no image or the image fails to load.
// - `name` is used as the alternative text (and to build the initials).
// - Set `decorative` when the name is already shown right next to the avatar,
//   so screen readers don't read it twice.
function Avatar({ src, name, size = 'md', decorative = false, className = '' }) {
  // Remember which image failed, so a new `src` gets a fresh try.
  const [failedSrc, setFailedSrc] = useState(null)
  const showImage = src && failedSrc !== src

  const classes = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizeClasses[size]} ${className}`

  if (showImage) {
    return (
      <img
        src={src}
        alt={decorative ? '' : name}
        onError={() => setFailedSrc(src)}
        className={`${classes} object-cover`}
      />
    )
  }

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={`${classes} bg-pale font-bold text-teal`}
    >
      {getInitials(name)}
    </span>
  )
}

export default Avatar
