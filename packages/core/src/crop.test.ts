import { describe, expect, it } from 'vitest'
import { fitFrame, sliceFileName, sliceRects, zoomFrame } from './crop'
import { PROFILE_OFFSET } from './layout'

describe('sliceRects', () => {
  it('maps artwork slices onto the source', () => {
    const [main, side] = sliceRects('artwork', { x: 10, y: 20, scale: 2, height: 100 })
    expect(main).toEqual({ id: 'main', name: 'artwork_1_main', sx: 10, sy: 20, sw: 1012, sh: 200, outWidth: 506, outHeight: 100 })
    expect(side).toMatchObject({ name: 'artwork_2_side', sx: 1040, sw: 200, outWidth: 100, outHeight: 100 })
  })

  it('exports workshop parts 150px wide and keeps the aspect ratio', () => {
    const rects = sliceRects('workshop', { x: 0, y: 0, scale: 1, height: 122.4 })
    expect(rects).toHaveLength(5)
    for (const r of rects) {
      expect(r.outWidth).toBe(150)
      expect(r.outHeight).toBe(150)
    }
    expect(rects.map((r) => r.name)).toEqual(['workshop_1', 'workshop_2', 'workshop_3', 'workshop_4', 'workshop_5'])
  })
})

describe('sliceFileName', () => {
  it('uses the kind name for single slices', () => {
    expect(sliceFileName('featured', 0)).toBe('featured')
  })

  it('tells artwork and screenshot parts apart', () => {
    expect(sliceFileName('artwork', 1)).toBe('artwork_2_side')
    expect(sliceFileName('screenshot', 0)).toBe('screenshot_1_main')
  })
})

describe('fitFrame', () => {
  it('puts a profile background where the showcase sits on the page', () => {
    const { x, y } = PROFILE_OFFSET.artwork
    expect(fitFrame('artwork', 1920, 1080)).toEqual({ x, y, scale: 1, height: Math.min(1080 - y, 800) })
  })

  it('fits any other image by width', () => {
    expect(fitFrame('artwork', 1230, 2000)).toEqual({ x: 0, y: 0, scale: 2, height: 1000 })
  })

  it('caps very tall images', () => {
    expect(fitFrame('featured', 630, 100000).height).toBe(4000)
  })
})

describe('zoomFrame', () => {
  it('keeps the center in place', () => {
    const frame = { x: 100, y: 100, scale: 1, height: 400 }
    const zoomed = zoomFrame('featured', frame, 2)
    expect(zoomed.scale).toBe(2)
    expect(zoomed.x + (630 * 2) / 2).toBeCloseTo(100 + 630 / 2, 0)
    expect(zoomed.y + (400 * 2) / 2).toBeCloseTo(100 + 400 / 2, 0)
  })

  it('does not go below the minimum scale', () => {
    expect(zoomFrame('featured', { x: 0, y: 0, scale: 1, height: 100 }, 0).scale).toBeGreaterThan(0)
  })
})
