import { describe, expect, it } from 'vitest'
import {
  getClickedAtFromAnalytics,
  getEmailStatusLabel,
  getOpenedAtFromAnalytics,
  isEmailClicked,
  isEmailOpened
} from './emailEngagement'

describe('emailEngagement', () => {
  it('derives opened and clicked state from status', () => {
    expect(isEmailOpened('opened')).toBe(true)
    expect(isEmailOpened('clicked')).toBe(true)
    expect(isEmailOpened('delivered')).toBe(false)
    expect(isEmailClicked('clicked')).toBe(true)
    expect(isEmailClicked('opened')).toBe(false)
  })

  it('falls back to click timestamp when there is no explicit open event', () => {
    const events = [
      { event_type: 'click', created_at: '2026-03-04T12:00:00.000Z' },
      { event_type: 'delivered', created_at: '2026-03-04T11:59:00.000Z' }
    ]

    expect(getClickedAtFromAnalytics(events)).toBe('2026-03-04T12:00:00.000Z')
    expect(getOpenedAtFromAnalytics(events, 'clicked')).toBe('2026-03-04T12:00:00.000Z')
  })

  it('labels delivered status as accepted by server', () => {
    expect(getEmailStatusLabel('delivered')).toBe('Aceito pelo servidor')
  })
})
