import { useCallback, useEffect, useRef, useState } from 'react'

// Holds a photo chosen on this device and a temporary preview URL for it.
//
// Preview URLs (URL.createObjectURL) keep the file in memory until they are
// revoked, so the old URL is revoked whenever the photo is changed or
// cleared, and when the page closes. This is done outside React's state
// updates, so it also works with StrictMode's double rendering.
//
// Returns { file, previewUrl, setFile } (setFile(null) clears the photo).
export function useLocalPhoto() {
  const [photo, setPhoto] = useState(null) // { file, previewUrl } or null
  const currentRef = useRef(null)

  const setFile = useCallback((file) => {
    if (currentRef.current) URL.revokeObjectURL(currentRef.current.previewUrl)
    const next = file ? { file, previewUrl: URL.createObjectURL(file) } : null
    currentRef.current = next
    setPhoto(next)
  }, [])

  useEffect(
    () => () => {
      if (currentRef.current) URL.revokeObjectURL(currentRef.current.previewUrl)
      currentRef.current = null
    },
    [],
  )

  return { file: photo?.file ?? null, previewUrl: photo?.previewUrl ?? null, setFile }
}
