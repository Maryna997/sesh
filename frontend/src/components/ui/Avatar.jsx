import { useState } from 'react'
import { getInitials } from '../../utils/initials'

// Sizes used in Figma: chat message (36), surfer card / inbox (44),
// chat header (48) and profile (82).
// `photoField` is the Create Profile photo tile: 64px on mobile, growing to
// 88px on tablet and 104px on desktop to fill the tile's free space.
// Initials keep about the same proportion (text ≈ a third of the circle).
const sizeClasses = {
  sm: 'size-9 text-[13px]',
  md: 'size-11 text-[15px]',
  lg: 'size-12 text-base',
  xl: 'size-[82px] text-[26px]',
  photoField: 'size-16 text-[21px] md:size-[88px] md:text-[28px] lg:size-[104px] lg:text-[34px]',
}

// Round profile picture. Shows the uploaded image when there is one, and the
// person's initials otherwise (also when the image fails to load). Sesh uses
// no generic default avatar image.
// - `name` is used as the alternative text (and to build the initials).
// - Set `decorative` when the name is already shown right next to the avatar,
//   so screen readers don't read it twice.
function Avatar({ src, name, size = 'md', decorative = false, className = '' }) {
  // Remember which image failed, so a new `src` gets a fresh try.
  const [failedSrc, setFailedSrc] = useState(null)
  const showImage = src && failedSrc !== src
  const label = typeof name === 'string' ? name.trim() : ''

  const classes = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizeClasses[size]} ${className}`

  if (showImage) {
    return (
      <img
        src={src}
        alt={decorative ? '' : label}
        onError={() => setFailedSrc(src)}
        className={`${classes} object-cover`}
      />
    )
  }

  return (
    <span
      role={decorative || !label ? undefined : 'img'}
      aria-label={decorative || !label ? undefined : label}
      aria-hidden={decorative || !label || undefined}
      className={`${classes} bg-pale font-bold text-teal`}
    >
      {getInitials(name)}
    </span>
  )
}

export default Avatar
