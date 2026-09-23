import { describe, expect, it } from 'vitest'
import { SHOWCASES, UPLOAD_SNIPPETS, crossesGap, sliceGaps } from './geometry'

describe('SHOWCASES', () => {
  it('artwork: 506 + 9 + 100', () => {
    const [main, side] = SHOWCASES.artwork.slices
    expect(main).toEqual({ id: 'main', x: 0, width: 506 })
    expect(side).toEqual({ id: 'side', x: 515, width: 100 })
    expect(SHOWCASES.artwork.width).toBe(615)
  })

  it('screenshot has the same layout as artwork', () => {
    expect(SHOWCASES.screenshot.slices).toEqual(SHOWCASES.artwork.slices)
  })

  it('featured is a single 630px slice', () => {
    expect(SHOWCASES.featured.slices).toEqual([{ id: 'main', x: 0, width: 630 }])
  })

  it('workshop: 5 columns fill the whole width', () => {
    const { slices, width } = SHOWCASES.workshop
    expect(slices).toHaveLength(5)
    const last = slices[4]!
    expect(last.x + last.width).toBeCloseTo(width, 5)
    for (let i = 1; i < slices.length; i++) {
      const gap = slices[i]!.x - (slices[i - 1]!.x + slices[i - 1]!.width)
      expect(gap).toBeCloseTo(4, 5)
    }
  })

  it('every showcase has an upload snippet', () => {
    for (const kind of Object.keys(SHOWCASES)) {
      expect(UPLOAD_SNIPPETS[kind as keyof typeof UPLOAD_SNIPPETS]).toBeTruthy()
    }
  })
})

describe('sliceGaps', () => {
  it('у избранной иллюстрации стыков нет', () => {
    expect(sliceGaps('featured')).toEqual([])
  })

  it('у иллюстраций один стык между широкой и узкой частью', () => {
    expect(sliceGaps('artwork')).toEqual([{ start: 506, end: 515 }])
  })

  it('у мастерской стык между каждой парой частей', () => {
    expect(sliceGaps('workshop')).toHaveLength(4)
  })

  it('видит, что слой лёг на стык', () => {
    expect(crossesGap('artwork', 400, 520)).toBe(true)
    expect(crossesGap('artwork', 400, 500)).toBe(false)
    expect(crossesGap('artwork', 520, 600)).toBe(false)
    expect(crossesGap('featured', 0, 630)).toBe(false)
  })
})
