import { describe, expect, it } from 'vitest'
import { PROFILE_OFFSET } from './layout'

// Замер живых профилей scripts/measure-profile.mjs: фон с y=104, левая колонка на x=484,
// первая витрина на y=344 от верха страницы, то есть 240 от верха фона
describe('PROFILE_OFFSET', () => {
  it('matches the measured page', () => {
    expect(PROFILE_OFFSET.artwork).toEqual({ x: 495, y: 256 })
    expect(PROFILE_OFFSET.featured).toEqual(PROFILE_OFFSET.artwork)
    expect(PROFILE_OFFSET.screenshot).toEqual({ x: 495, y: 301 })
    expect(PROFILE_OFFSET.workshop).toEqual({ x: 496, y: 380 })
  })
})
