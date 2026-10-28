import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Avatar from './Avatar'
import { getInitials } from '../../utils/initials'

describe('getInitials', () => {
  test.each([
    ['Emma Laurent', 'EL'],
    ['Emma', 'E'],
    ['John Michael Doe', 'JD'],
    ['   emma    laurent  ', 'EL'],
    ['Élodie Ângelo', 'ÉÂ'],
    ['🌊 Surfer', '🌊S'],
  ])('%j -> %j', (name, initials) => {
    expect(getInitials(name)).toBe(initials)
  })

  test.each([[''], ['    '], [null], [undefined], [42], [{}]])('malformed name %j -> ""', (name) => {
    expect(getInitials(name)).toBe('')
  })
})

describe('Avatar', () => {
  test('shows the uploaded image when there is one', () => {
    render(<Avatar src="https://res.cloudinary.com/x/image/upload/a.jpg" name="Emma Laurent" />)
    const image = screen.getByRole('img', { name: 'Emma Laurent' })
    expect(image.tagName).toBe('IMG')
    expect(image.getAttribute('src')).toBe('https://res.cloudinary.com/x/image/upload/a.jpg')
    expect(screen.queryByText('EL')).toBeNull()
  })

  test('shows initials (no default image) when there is no picture', () => {
    render(<Avatar name="Emma Laurent" size="xl" />)
    const initials = screen.getByRole('img', { name: 'Emma Laurent' })
    expect(initials.tagName).toBe('SPAN')
    expect(initials.textContent).toBe('EL')
    expect(document.querySelector('img')).toBeNull()
  })

  test('falls back to initials when the image fails to load', () => {
    render(<Avatar src="https://example.com/broken.jpg" name="Emma" />)
    fireEvent.error(screen.getByRole('img', { name: 'Emma' }))
    expect(screen.getByRole('img', { name: 'Emma' }).textContent).toBe('E')
    expect(document.querySelector('img')).toBeNull()
  })

  test('decorative avatars are hidden from screen readers', () => {
    render(<Avatar name="Emma Laurent" decorative />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('EL').getAttribute('aria-hidden')).toBe('true')
  })

  test('without a usable name the circle stays empty and is hidden', () => {
    render(<Avatar name="   " />)
    expect(screen.queryByRole('img')).toBeNull()
  })
})
