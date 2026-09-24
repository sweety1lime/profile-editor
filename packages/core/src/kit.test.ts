import { describe, expect, it } from 'vitest'
import { sliceRects } from './crop'
import { SHOWCASES, hasCounter } from './geometry'
import { PROFILE_FIRST_SHOWCASE_Y, PROFILE_LAYOUT, PROFILE_OFFSET } from './layout'
import {
  fitKit,
  kitBackgroundHeight,
  kitBlocks,
  kitFrame,
  kitSliceRects,
  kitSlots,
  kitSpan,
  showcaseBlockHeight,
  zoomKit,
  type KitItem,
} from './kit'

const item = (kind: KitItem['kind'], height: number): KitItem => ({ id: kind, kind, height })

// Блоки витрин с живых профилей: высота картинки → высота блока. Под иллюстрациями и
// скриншотами тут без плашки «+N» или с короткими картинками справа, так что плашка не мешает;
// у высокой иллюстрации с плашкой правая колонка длиннее левой
describe('showcaseBlockHeight', () => {
  it('matches the blocks measured on live profiles', () => {
    expect(showcaseBlockHeight('featured', 630)).toBe(681)
    expect(showcaseBlockHeight('screenshot', 284, false)).toBe(380)
    expect(showcaseBlockHeight('artwork', 284, false)).toBe(335)
    expect(showcaseBlockHeight('workshop', 122.4)).toBeCloseTo(369.4)
    // правая картинка тут на 0,3 px выше левой
    expect(showcaseBlockHeight('artwork', 734.7)).toBeCloseTo(842, 0)
  })

  it('only the columns with a counter grow from it', () => {
    expect(hasCounter('artwork')).toBe(true)
    expect(hasCounter('featured')).toBe(false)
    expect(showcaseBlockHeight('artwork', 300) - showcaseBlockHeight('artwork', 300, false)).toBe(56)
    expect(showcaseBlockHeight('featured', 300)).toBe(showcaseBlockHeight('featured', 300, false))
  })
})

describe('kitSlots', () => {
  it('puts the first showcase where the single-showcase cutter puts it', () => {
    for (const kind of ['artwork', 'screenshot', 'featured', 'workshop'] as const) {
      const [slot] = kitSlots([item(kind, 200)])
      expect({ x: slot!.x, y: slot!.y }).toEqual(PROFILE_OFFSET[kind])
    }
  })

  it('takes the counter of each showcase into account', () => {
    const [, withCounter] = kitSlots([item('artwork', 200), item('featured', 100)])
    const [, without] = kitSlots([{ ...item('artwork', 200), counter: false }, item('featured', 100)])
    expect(withCounter!.blockTop - without!.blockTop).toBe(56)
  })

  it('leaves room for a showcase that is not cut, without a window of its own', () => {
    const with_ = kitSlots([item('artwork', 200), { id: 'o', kind: 'other', height: 150 }, item('featured', 100)])
    const without = kitSlots([item('artwork', 200), item('featured', 100)])
    expect(with_.map((slot) => slot.kind)).toEqual(['artwork', 'featured'])
    expect(with_[1]!.blockTop - without[1]!.blockTop).toBe(150 + PROFILE_LAYOUT.showcaseGap)
  })

  it('stacks the next showcase under the previous block with the page gap', () => {
    const slots = kitSlots([item('artwork', 200), item('featured', 300)])
    const [first, second] = slots
    expect(first!.blockHeight).toBe(showcaseBlockHeight('artwork', 200))
    expect(second!.blockTop).toBe(first!.blockTop + first!.blockHeight + PROFILE_LAYOUT.showcaseGap)
    expect(second!.y).toBe(second!.blockTop + 16)
  })

  it('keeps every showcase in the left column', () => {
    const slots = kitSlots([item('workshop', 119), item('artwork', 200)])
    for (const slot of slots) expect(slot.x).toBeGreaterThanOrEqual(PROFILE_LAYOUT.columnsPadding)
    expect(slots[0]!.width).toBe(SHOWCASES.workshop.width)
  })
})

describe('kitSliceRects', () => {
  it('keeps the page gap between the parts of a showcase', () => {
    const [slot] = kitSlots([item('artwork', 200)])
    const [main, side] = kitSliceRects(slot!)
    expect(main).toEqual({ x: slot!.x, y: slot!.y, width: 506, height: 200 })
    expect(side!.x - (main!.x + main!.width)).toBe(9)
  })

  it('gives the workshop five equal parts', () => {
    const [slot] = kitSlots([item('workshop', 119)])
    const rects = kitSliceRects(slot!)
    expect(rects).toHaveLength(5)
    expect(new Set(rects.map((r) => r.width)).size).toBe(1)
  })
})

describe('kitSpan', () => {
  it('covers every showcase picture', () => {
    const slots = kitSlots([item('artwork', 200), item('featured', 300)])
    const span = kitSpan(slots)!
    expect(span.x).toBe(Math.min(slots[0]!.x, slots[1]!.x))
    expect(span.y).toBe(slots[0]!.y)
    expect(span.height).toBe(slots[1]!.y + 300 - slots[0]!.y)
    expect(span.width).toBeGreaterThanOrEqual(SHOWCASES.featured.width)
  })

  it('counts a trailing other showcase into the page height', () => {
    const blocks = kitBlocks([item('artwork', 200), { id: 'o', kind: 'other', height: 150 }])
    expect(blocks[1]!.height).toBe(150)
    expect(kitBackgroundHeight(blocks)).toBe(blocks[1]!.top + 150 + PROFILE_LAYOUT.columnsPadding)
    expect(showcaseBlockHeight('other', 150)).toBe(150)
  })

  it('has nothing to cover when the kit is empty', () => {
    expect(kitSpan([])).toBeNull()
    expect(kitBackgroundHeight([])).toBe(PROFILE_FIRST_SHOWCASE_Y + PROFILE_LAYOUT.columnsPadding)
  })
})

describe('kitFrame', () => {
  it('cuts a profile background exactly like the single-showcase path', () => {
    const [slot] = kitSlots([item('artwork', 300)])
    const frame = kitFrame(slot!, { x: 0, y: 0, scale: 1 })
    expect(frame).toEqual({ ...PROFILE_OFFSET.artwork, scale: 1, height: 300 })
    expect(sliceRects('artwork', frame)).toEqual(sliceRects('artwork', { ...PROFILE_OFFSET.artwork, scale: 1, height: 300 }))
  })

  it('turns a scaled placement into source pixels', () => {
    const [slot] = kitSlots([item('featured', 200)])
    // картинка вдвое крупнее профиля и сдвинута, значит в исходник попадает половина расстояния
    const frame = kitFrame(slot!, { x: slot!.x - 100, y: slot!.y - 50, scale: 2 })
    expect(frame.x).toBe(50)
    expect(frame.y).toBe(25)
    expect(frame.scale).toBe(0.5)
    expect(frame.height).toBe(200)
  })
})

describe('fitKit', () => {
  it('covers the whole kit and centers the art', () => {
    const slots = kitSlots([item('artwork', 200), item('featured', 200)])
    const span = kitSpan(slots)!
    const placement = fitKit(1000, 1000, slots)
    expect(placement.scale).toBeGreaterThanOrEqual(span.width / 1000)
    expect(placement.scale).toBeGreaterThanOrEqual(span.height / 1000)
    // центр картинки совпадает с центром комплекта
    expect(placement.x + (1000 * placement.scale) / 2).toBeCloseTo(span.x + span.width / 2)
    expect(placement.y + (1000 * placement.scale) / 2).toBeCloseTo(span.y + span.height / 2)
  })

  it('leaves an empty kit alone', () => {
    expect(fitKit(100, 100, [])).toEqual({ x: 0, y: 0, scale: 1 })
  })
})

describe('zoomKit', () => {
  it('keeps the point under the cursor in place', () => {
    const placement = { x: 100, y: 200, scale: 1 }
    const center = { x: 300, y: 400 }
    const next = zoomKit(placement, 2, center)
    // точка картинки под курсором осталась той же
    expect((center.x - next.x) / next.scale).toBeCloseTo((center.x - placement.x) / placement.scale)
    expect((center.y - next.y) / next.scale).toBeCloseTo((center.y - placement.y) / placement.scale)
  })

  it('does not zoom past the limits', () => {
    expect(zoomKit({ x: 0, y: 0, scale: 1 }, 1000, { x: 0, y: 0 }).scale).toBe(20)
    expect(zoomKit({ x: 0, y: 0, scale: 1 }, 0, { x: 0, y: 0 }).scale).toBe(0.02)
  })
})
