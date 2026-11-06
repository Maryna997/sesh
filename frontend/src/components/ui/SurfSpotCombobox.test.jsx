import { afterEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import SurfSpotCombobox from './SurfSpotCombobox'
import { SURF_SPOTS } from '../../data/surfSpots'

const SPOTS = [
  { id: 'pt-cascais-carcavelos', name: 'Carcavelos', kind: 'beach', area: 'Carcavelos', municipality: 'Cascais', region: 'Lisbon', country: 'Portugal' },
  { id: 'pt-cascais-guincho', name: 'Guincho', kind: 'beach', area: 'Cascais', municipality: 'Cascais', region: 'Lisbon', country: 'Portugal' },
]

function Harness({ onChange, initial = null, ...props }) {
  const [value, setValue] = useState(initial)
  return (
    <SurfSpotCombobox
      label="Surf spot"
      spots={SPOTS}
      value={value}
      onChange={(id, spot) => {
        setValue(id)
        onChange?.(id, spot)
      }}
      {...props}
    />
  )
}

// Places the field at the given position in a window of the given height
function placeField({ top, height = 46, windowHeight = 768 }) {
  const original = window.innerHeight
  window.innerHeight = windowHeight
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top, bottom: top + height, left: 0, right: 300, width: 300, height })
  return () => (window.innerHeight = original)
}

let restoreWindow = () => {}
afterEach(() => restoreWindow())

describe('SurfSpotCombobox suggestions placement', () => {
  test('opens downward with the full height when there is room', async () => {
    restoreWindow = placeField({ top: 120 })
    render(<Harness />)
    await userEvent.setup().click(screen.getByRole('combobox'))
    const list = screen.getByRole('listbox')
    expect(list.className).toContain('top-full')
    expect(list.style.maxHeight).toBe('288px')
    expect(list.className).toContain('overflow-y-auto')
  })

  test('opens upward near the bottom of the screen', async () => {
    restoreWindow = placeField({ top: 700 })
    render(<Harness />)
    await userEvent.setup().click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox').className).toContain('bottom-full')
  })

  test('on a short screen the list shrinks to the room left (scrolling inside)', async () => {
    restoreWindow = placeField({ top: 150, windowHeight: 400 })
    render(<Harness />)
    await userEvent.setup().click(screen.getByRole('combobox'))
    const list = screen.getByRole('listbox')
    expect(list.className).toContain('top-full')
    expect(list.style.maxHeight).toBe('196px') // 400 - 196 (field bottom) - 8 margin
  })
})

// Regression: the list used to snap back while being scrolled. A capture
// "scroll" listener heard the list's own scrolling and re-rendered, and an
// effect then called scrollIntoView on the highlighted option after every
// render. jsdom has no layout or native scrolling, so these tests check the
// mechanism (no forced scrolling, scroll events not blocked), not the feel
// of a real wheel, trackpad or touch scroll.
describe('SurfSpotCombobox scrolling (all 29 sample spots)', () => {
  const ALL = SURF_SPOTS
  function setup(props = {}) {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    render(<Harness spots={ALL} {...props} />)
    return { scrollIntoView, input: screen.getByRole('combobox') }
  }

  test('the list has a height limit and scrolls inside', async () => {
    const { input } = setup()
    await userEvent.setup().click(input)
    const list = screen.getByRole('listbox')
    expect(within(list).getAllByRole('option')).toHaveLength(ALL.length)
    expect(list.style.maxHeight).toBe('288px')
    expect(list.className).toMatch(/\boverflow-y-auto\b/)
    expect(list.className).toMatch(/\babsolute\b/)
  })

  test('scrolling, wheel, touch and hovering never move the list back', async () => {
    const user = userEvent.setup()
    const { scrollIntoView, input } = setup()
    await user.click(input)
    const list = screen.getByRole('listbox')
    scrollIntoView.mockClear()

    list.scrollTop = 600
    expect(fireEvent.wheel(list, { deltaY: 600 })).toBe(true) // not prevented
    expect(fireEvent.touchStart(list)).toBe(true)
    expect(fireEvent.touchMove(list)).toBe(true)
    fireEvent.scroll(list)
    fireEvent.scroll(window)
    const farOption = within(list).getAllByRole('option')[20]
    fireEvent.mouseMove(farOption)
    expect(farOption.className).toContain('bg-card') // hover still highlights

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(list.scrollTop).toBe(600)
    expect(screen.getByRole('listbox')).toBe(list) // same list, still open
  })

  test('a spot far down the list can be chosen after scrolling', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    setup({ onChange })
    await user.click(screen.getByRole('combobox'))
    const list = screen.getByRole('listbox')
    list.scrollTop = 900
    fireEvent.scroll(list)
    const last = ALL[ALL.length - 1]
    await user.click(within(list).getAllByRole('option').at(-1))
    expect(onChange).toHaveBeenCalledWith(last.id, last)
  })

  test('the keyboard reaches options outside the visible part and shows them', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { scrollIntoView, input } = setup({ onChange })
    input.focus()
    await user.keyboard('{ArrowDown}') // opens on the first spot
    scrollIntoView.mockClear()
    for (let step = 0; step < 24; step++) await user.keyboard('{ArrowDown}')

    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[24].id)
    expect(scrollIntoView).toHaveBeenCalledTimes(24)
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(options[24])

    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith(ALL[24].id, ALL[24])
  })

  test('opening shows the selected spot', async () => {
    const selected = ALL[22]
    const { scrollIntoView, input } = setup({ initial: selected.id })
    await userEvent.setup().click(input)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0].getAttribute('aria-selected')).toBe('true')
  })

  test('search still works on the full list (case and accents ignored)', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByRole('combobox'), 'SAO JOAO')
    const names = within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent)
    expect(names.length).toBeGreaterThan(0)
    expect(names.every((name) => name.includes('São João'))).toBe(true)
  })
})

describe('SurfSpotCombobox Escape', () => {
  test.each([
    ['default (profile and status forms)', {}],
    ['Discover options', { keepSelectionWhileTyping: true, noSpotLabel: 'All spots' }],
  ])('%s: Escape closes the list and never clears the selection', async (_, props) => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="pt-cascais-guincho" onChange={onChange} {...props} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    expect(screen.getByRole('listbox')).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.keyboard('{Escape}')
    expect(input.value).toBe('Guincho')
    expect(onChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Clear surf spot' }))
    expect(onChange).toHaveBeenCalledWith(null, null)
    expect(input.value).toBe('')
  })
})

describe('SurfSpotCombobox behaviour options', () => {
  test('default (profile and status forms): typing clears the selected value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="pt-cascais-guincho" onChange={onChange} />)
    await user.type(screen.getByRole('combobox'), 'c')
    expect(onChange).toHaveBeenCalledWith(null, null)
    expect(screen.queryByRole('option', { name: 'All spots' })).toBeNull()
  })

  test('keepSelectionWhileTyping + noSpotLabel: typing only searches; "All spots" means no spot', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="pt-cascais-guincho" onChange={onChange} keepSelectionWhileTyping noSpotLabel="All spots" />)
    await user.type(screen.getByRole('combobox'), 'car')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('option', { name: 'All spots' })).toBeNull() // hidden while searching

    await user.keyboard('{Escape}')
    expect(screen.getByRole('combobox').value).toBe('Guincho')

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'All spots' }))
    expect(onChange).toHaveBeenCalledWith(null, null)
    expect(screen.getByRole('combobox').value).toBe('')
  })

  test('getSpotLabel changes how the selected spot is shown', () => {
    render(<Harness initial="pt-cascais-guincho" getSpotLabel={(spot) => `${spot.name}, ${spot.area}`} />)
    expect(screen.getByRole('combobox').value).toBe('Guincho, Cascais')
  })
})
