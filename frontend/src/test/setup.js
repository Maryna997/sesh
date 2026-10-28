// Runs before every frontend test file (see vite.config.js).
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// jsdom has no scrollIntoView (SurfSpotCombobox keeps the highlighted
// result visible with it). Layout doesn't exist in jsdom, so it does nothing.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom has no object URLs (used for local photo previews). Tests get fake
// "blob:" URLs; a test can spy on these to check that previews are revoked.
if (!URL.createObjectURL) {
  let nextPreview = 0
  URL.createObjectURL = () => `blob:sesh-test/${++nextPreview}`
  URL.revokeObjectURL = () => {}
}

// jsdom has no matchMedia (the Header uses it to close the burger menu on
// wider screens). Tests run as if on a narrow screen.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false
    },
  })
}
