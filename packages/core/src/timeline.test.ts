import { describe, expect, it } from 'vitest'
import {
  FRAME_MEMORY_BUDGET,
  MAX_FRAMES,
  buildTimeline,
  delayForFps,
  framesInBudget,
  nearestFps,
  stepForBudget,
  thinFrames,
} from './timeline'

describe('buildTimeline', () => {
  it('spreads frames evenly', () => {
    const { timestamps, delays } = buildTimeline(1, 1, 10)
    expect(timestamps).toEqual([1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9])
    expect(delays.every((d) => d === 10)).toBe(true)
  })

  it('never goes over the frame cap', () => {
    expect(buildTimeline(0, 60, 25).timestamps).toHaveLength(MAX_FRAMES)
  })

  it('keeps at least one frame', () => {
    expect(buildTimeline(0, 0, 10).timestamps).toHaveLength(1)
  })
})

describe('delayForFps', () => {
  it('rounds to whole hundredths and keeps the minimum', () => {
    expect(delayForFps(12)).toBe(8)
    expect(delayForFps(1000)).toBe(2)
  })
})

describe('thinFrames', () => {
  it('drops frames and keeps the total length', () => {
    const delays = [10, 10, 10, 10, 10]
    const thin = thinFrames(delays, 2)
    expect(thin.indices).toEqual([0, 2, 4])
    expect(thin.delays).toEqual([20, 20, 10])
    expect(thin.delays.reduce((a, b) => a + b)).toBe(50)
  })

  it('step 1 changes nothing', () => {
    expect(thinFrames([8, 8], 1)).toEqual({ indices: [0, 1], delays: [8, 8] })
  })
})

describe('nearestFps', () => {
  it('picks the closest option', () => {
    expect(nearestFps(30)).toBe(25)
    expect(nearestFps(11)).toBe(10)
    expect(nearestFps(14)).toBe(15)
  })
})

describe('memory budget', () => {
  it('counts how many frames fit', () => {
    expect(framesInBudget(1000, 10000)).toBe(10)
    expect(framesInBudget(3000, 10000)).toBe(3)
  })

  it('never drops below a single frame', () => {
    expect(framesInBudget(999999, 10)).toBe(1)
    expect(framesInBudget(0, 10)).toBe(10)
  })

  it('leaves an ordinary showcase alone', () => {
    // иллюстрации 506 + 100 на высоте 380 — меньше мегабайта на кадр
    const perFrame = (506 * 380 + 100 * 380) * 4
    expect(stepForBudget(MAX_FRAMES, perFrame)).toBe(1)
  })

  it('thins a tall showcase that would not fit in memory', () => {
    const perFrame = (506 * 4000 + 100 * 4000) * 4
    const step = stepForBudget(MAX_FRAMES, perFrame)
    expect(step).toBeGreaterThan(1)
    expect(Math.ceil(MAX_FRAMES / step) * perFrame).toBeLessThanOrEqual(FRAME_MEMORY_BUDGET)
  })
})
