import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import ArrivalPicker from './ArrivalPicker'
import { arrivalOptions } from '../../utils/availabilityForm'

// 09:40 Lisbon (summer): the 05:00 and 07:00 windows have ended
const NOW = new Date('2026-07-15T08:40:00Z')

function Harness({ initial = '', onChange = () => {}, error }) {
  const [value, setValue] = useState(initial)
  return (
    <ArrivalPicker
      id="arrival"
      label="Approximate arrival time"
      required
      placeholder="Choose when you’ll arrive"
      groups={arrivalOptions(NOW)}
      helperText="All times are shown in Portugal mainland time (Lisbon)."
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      error={error}
    />
  )
}

const field = () => screen.getByRole('button', { name: /^Approximate arrival time/ })
const choices = () => document.getElementById('arrival-choices')

describe('ArrivalPicker', () => {
  test('a labelled, required field showing the placeholder; closed at first', () => {
    render(<Harness />)
    expect(screen.getByText('Approximate arrival time')).toBeTruthy()
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true')
    expect(field().textContent).toBe('Choose when you’ll arrive')
    expect(field().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByText('All times are shown in Portugal mainland time (Lisbon).')).toBeTruthy()
  })

  test('opens inline (in the page flow) with a maximum height and its own scrolling', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(field())
    expect(field().getAttribute('aria-expanded')).toBe('true')
    expect(field().getAttribute('aria-controls')).toBe('arrival-choices')
    expect(choices().className).toMatch(/max-h-72/)
    expect(choices().className).toMatch(/overflow-y-auto/)
    expect(choices().className).not.toMatch(/\b(absolute|fixed)\b/)
  })

  test('both groups and every choice, including the last window, are there', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(field())
    const relative = screen.getByRole('group', { name: 'In about…' })
    const windows = screen.getByRole('group', { name: 'Time window today' })
    expect(within(relative).getAllByRole('radio').map((radio) => radio.closest('label').textContent)).toEqual([
      'In about 30 minutes',
      'In about 1 hour',
      'In about 2 hours',
    ])
    const windowLabels = within(windows).getAllByRole('radio').map((radio) => radio.closest('label').textContent)
    expect(windowLabels).toHaveLength(8)
    expect(windowLabels.at(-1)).toBe('19:00–21:00')
    expect(screen.getByRole('radio', { name: '19:00–21:00' }).disabled).toBe(false)
  })

  test('ended windows stay visible, disabled and explained', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(field())
    expect(screen.getByRole('radio', { name: '05:00–07:00 (ended)' }).disabled).toBe(true)
    expect(screen.getByRole('radio', { name: '07:00–09:00 (ended)' }).disabled).toBe(true)
    expect(screen.getByRole('radio', { name: '09:00–11:00' }).disabled).toBe(false) // started, not ended
  })

  test('clicking a choice selects it, closes the list and returns focus with the choice announced', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await user.click(field())
    await user.click(screen.getByRole('radio', { name: '19:00–21:00' }))
    expect(onChange).toHaveBeenCalledWith('window:19')
    expect(choices()).toBeNull()
    expect(document.activeElement).toBe(field())
    expect(field().textContent).toBe('19:00–21:00')
    expect(screen.getByRole('button', { name: 'Approximate arrival time 19:00–21:00' })).toBe(field())
  })

  test('keyboard: focus starts on the chosen option, arrows move, Enter closes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="relative:30" onChange={onChange} />)
    field().focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'In about 30 minutes' }))
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith('relative:60')
    expect(choices()).toBeTruthy() // still open while moving with the keyboard
    await user.keyboard('{Enter}')
    expect(choices()).toBeNull()
    expect(document.activeElement).toBe(field())
    expect(field().textContent).toBe('In about 1 hour')
  })

  test('Escape closes the list', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="window:9" onChange={onChange} />)
    await user.click(field())
    await user.keyboard('{Escape}')
    expect(choices()).toBeNull()
    expect(document.activeElement).toBe(field())
    expect(onChange).not.toHaveBeenCalled()
  })

  test('errors are linked to the field', () => {
    render(<Harness error="Choose when you expect to arrive." />)
    expect(field().getAttribute('aria-invalid')).toBe('true')
    expect(field().getAttribute('aria-describedby')).toBe('arrival-helper arrival-error')
  })
})
