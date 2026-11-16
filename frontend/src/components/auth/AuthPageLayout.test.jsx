import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import AuthPageLayout from './AuthPageLayout'

// jsdom has no layout engine, so these tests pin down the responsive column
// rules of the shared two-column layout (Login, Register, Create Profile,
// My Profile); the actual widths are checked in a browser.
function renderLayout() {
  render(
    <MemoryRouter>
      <AuthPageLayout pageName="Login" heading="Welcome back" description="Log in." image="/photo.jpg">
        <p>Form</p>
      </AuthPageLayout>
    </MemoryRouter>,
  )
  return screen.getByTestId('auth-layout-grid').classList
}

describe('AuthPageLayout columns', () => {
  test('mobile: one column', () => {
    const classes = renderLayout()
    expect(classes).toContain('grid')
    expect([...classes].some((name) => /^grid-cols-/.test(name))).toBe(false)
  })

  // Task 13 regression: without min-w-0 the panel (a grid item) grew to its
  // widest unbreakable content — a long name or message preview — and the
  // Messages inbox and chat scrolled sideways on phones (checked in a browser)
  test('mobile: the panel may shrink below its content, so long text never widens the page', () => {
    renderLayout()
    const panel = screen.getByRole('heading', { level: 1, name: 'Welcome back' }).closest('section')
    expect(panel.classList).toContain('min-w-0')
  })

  test('tablet: intro column next to the 390px Figma panel', () => {
    expect(renderLayout()).toContain('md:grid-cols-[minmax(0,1fr)_390px]')
  })

  test('small desktop (1024–1279px): two equal columns, so the intro is not squeezed', () => {
    const classes = renderLayout()
    expect(classes).toContain('lg:grid-cols-2')
    expect(classes).toContain('lg:gap-12')
    expect(classes).not.toContain('lg:grid-cols-[minmax(0,1fr)_520px]')
  })

  test('desktop (1280px+): the 520px Figma panel', () => {
    const classes = renderLayout()
    expect(classes).toContain('xl:grid-cols-[minmax(0,1fr)_520px]')
    expect(classes).toContain('xl:gap-16')
  })
})
