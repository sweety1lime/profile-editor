import { describe, expect, it } from 'vitest'
import { PROFILE_OFFSET } from './layout'

// Сверено с живой страницей профиля: левая колонка на x=484, первая витрина на y=340, фон с y=104
describe('PROFILE_OFFSET', () => {
  it('matches the measured page', () => {
    expect(PROFILE_OFFSET.artwork).toEqual({ x: 503, y: 305 })
    expect(PROFILE_OFFSET.screenshot).toEqual(PROFILE_OFFSET.artwork)
    expect(PROFILE_OFFSET.workshop).toEqual({ x: 504, y: 306 })
    expect(PROFILE_OFFSET.featured).toEqual({ x: 495, y: 252 })
  })
})
