import { describe, expect, it } from 'vitest'
import { sliceRects } from './crop'
import { SHOWCASES } from './geometry'
import { PROFILE_COLUMN_X, PROFILE_FIRST_SHOWCASE_Y, PROFILE_LAYOUT, PROFILE_OFFSET } from './layout'
import { kitSlots, type KitItem } from './kit'
import {
  crossesSeam,
  fitSceneFrame,
  hiddenBetweenSlots,
  isKitBox,
  kitBox,
  showcaseBox,
  slotFrame,
  zoomSceneFrame,
} from './scene'

const item = (kind: KitItem['kind'], height: number): KitItem => ({ id: kind, kind, height })
const rect = (left: number, right: number, top = 0, bottom = 10000) => ({ left, right, top, bottom })

describe('showcaseBox', () => {
  it('is the showcase itself with one window at the corner', () => {
    const box = showcaseBox('artwork', 400)
    expect(box.width).toBe(Math.ceil(SHOWCASES.artwork.width))
    expect(box.height).toBe(400)
    expect(box.origin).toEqual(PROFILE_OFFSET.artwork)
    expect(box.slots).toEqual([{ id: 'artwork', kind: 'artwork', x: 0, y: 0, height: 400 }])
    expect(isKitBox(box)).toBe(false)
  })

  it('cuts exactly like the single-showcase path', () => {
    const box = showcaseBox('workshop', 119)
    expect(sliceRects('workshop', slotFrame(box.slots[0]!))).toEqual(
      sliceRects('workshop', { x: 0, y: 0, scale: 1, height: 119 }),
    )
  })
})

describe('kitBox', () => {
  it('is the left column with every showcase in its place', () => {
    const items = [item('artwork', 200), item('featured', 300)]
    const box = kitBox(items)
    const slots = kitSlots(items)
    expect(box.width).toBe(PROFILE_LAYOUT.leftWidth)
    expect(box.origin).toEqual({ x: PROFILE_COLUMN_X, y: PROFILE_FIRST_SHOWCASE_Y })
    expect(isKitBox(box)).toBe(true)
    box.slots.forEach((slot, i) => {
      expect(slot.x).toBe(slots[i]!.x - PROFILE_COLUMN_X)
      expect(slot.y).toBe(slots[i]!.y - PROFILE_FIRST_SHOWCASE_Y)
    })
    // холст кончается там же, где нижний край последнего блока витрины
    const last = slots[slots.length - 1]!
    expect(box.height).toBe(last.blockTop + last.blockHeight - PROFILE_FIRST_SHOWCASE_Y)
  })

  it('survives an empty kit', () => {
    const box = kitBox([])
    expect(box.slots).toEqual([])
    expect(box.height).toBeGreaterThan(0)
  })
})

describe('crossesSeam', () => {
  it('catches a layer lying on the gap between the parts', () => {
    const box = showcaseBox('artwork', 400)
    // зазор у иллюстраций между 506 и 515
    expect(crossesSeam(box, rect(500, 520))).toBe(true)
    expect(crossesSeam(box, rect(0, 500))).toBe(false)
    expect(crossesSeam(box, rect(520, 600))).toBe(false)
  })

  it('has nothing to cross on the featured showcase', () => {
    expect(crossesSeam(showcaseBox('featured', 400), rect(0, 630))).toBe(false)
  })

  it('checks only the showcases the layer actually reaches', () => {
    const box = kitBox([item('featured', 200), item('artwork', 200)])
    const artwork = box.slots[1]!
    const above = rect(500, 520, 0, 10)
    const inside = rect(artwork.x + 500, artwork.x + 520, artwork.y + 10, artwork.y + 20)
    expect(crossesSeam(box, above)).toBe(false)
    expect(crossesSeam(box, inside)).toBe(true)
  })
})

describe('hiddenBetweenSlots', () => {
  it('notices a layer that fell between two showcases', () => {
    const box = kitBox([item('artwork', 200), item('featured', 200)])
    const [first, second] = box.slots
    const band = { left: 0, right: 100, top: first!.y + first!.height + 2, bottom: second!.y - 2 }
    expect(hiddenBetweenSlots(box, band)).toBe(true)
    expect(hiddenBetweenSlots(box, rect(0, 100, first!.y, first!.y + 10))).toBe(false)
  })

  it('says nothing when there are no showcases at all', () => {
    expect(hiddenBetweenSlots(kitBox([]), rect(0, 10))).toBe(false)
  })
})

describe('fitSceneFrame', () => {
  it('puts a profile background where the canvas sits on the page', () => {
    const box = kitBox([item('artwork', 200)])
    const frame = fitSceneFrame(box, 1920, 1080)
    expect({ x: frame.x, y: frame.y, scale: frame.scale }).toEqual({ ...box.origin, scale: 1 })
  })

  it('fits any other picture by width', () => {
    const box = showcaseBox('featured', 300)
    const frame = fitSceneFrame(box, 1260, 600)
    expect(frame.scale).toBe(2)
    expect(frame).toMatchObject({ x: 0, y: 0, height: 300 })
  })
})

describe('zoomSceneFrame', () => {
  it('keeps the middle of the canvas in place', () => {
    const box = showcaseBox('artwork', 400)
    const frame = { x: 100, y: 200, scale: 1, height: 400 }
    const next = zoomSceneFrame(box, frame, 2)
    // угол округляется до пикселя, поэтому центр может уехать на полпикселя
    const cx = frame.x + (box.width * frame.scale) / 2
    const cy = frame.y + (frame.height * frame.scale) / 2
    expect(Math.abs(next.x + (box.width * next.scale) / 2 - cx)).toBeLessThanOrEqual(1)
    expect(Math.abs(next.y + (next.height * next.scale) / 2 - cy)).toBeLessThanOrEqual(1)
  })
})
