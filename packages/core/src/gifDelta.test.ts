import { describe, expect, it } from 'vitest'
import { GIF_ATTEMPTS, frameDelta, orderedDither, setFramePosition } from './gifDelta'

const palette = [
  [0, 0, 0],
  [255, 255, 255],
  [250, 250, 250],
  [255, 0, 0],
]
const T = 9

// настоящие цвета кадра: берём прямо из палитры по индексам
const rgba = (indices: number[], colors: number[][] = palette) =>
  new Uint8ClampedArray(indices.flatMap((i) => [...colors[i]!, 255]))

describe('frameDelta', () => {
  it('writes a single transparent point when nothing moved', () => {
    const shown = new Uint8Array([1, 1, 1, 1])
    const delta = frameDelta(shown, new Uint8Array([1, 1, 1, 1]), rgba([1, 1, 1, 1]), 2, 2, palette, 0, T)
    expect(delta).toEqual({ x: 0, y: 0, width: 1, height: 1, pixels: new Uint8Array([T]) })
  })

  it('crops to the changed area and keeps the rest transparent', () => {
    // 4×3, поменялись точки (1,1) и (2,2)
    const shown = new Uint8Array(12)
    const next = new Uint8Array(12)
    next[1 * 4 + 1] = 3
    next[2 * 4 + 2] = 3
    const delta = frameDelta(shown, next, rgba(Array.from(next)), 4, 3, palette, 0, T)
    expect({ x: delta.x, y: delta.y, width: delta.width, height: delta.height }).toEqual({ x: 1, y: 1, width: 2, height: 2 })
    expect(Array.from(delta.pixels)).toEqual([3, T, T, 3])
  })

  it('updates what is shown, so the next frame compares against the screen', () => {
    const shown = new Uint8Array([0, 0])
    frameDelta(shown, new Uint8Array([3, 0]), rgba([3, 0]), 2, 1, palette, 0, T)
    expect(Array.from(shown)).toEqual([3, 0])
    const again = frameDelta(shown, new Uint8Array([3, 0]), rgba([3, 0]), 2, 1, palette, 0, T)
    expect(again.pixels).toEqual(new Uint8Array([T]))
  })

  it('keeps a point while the shown color is close enough to the real one', () => {
    const shown = new Uint8Array([1, 0])
    // на экране белый, настоящий цвет почти белый — точку не трогаем, хоть индекс и другой
    const delta = frameDelta(shown, new Uint8Array([2, 0]), rgba([2, 0]), 2, 1, palette, 3 * 5 * 5, T)
    expect(delta.pixels).toEqual(new Uint8Array([T]))
    expect(shown[0]).toBe(1)
  })

  it('does not let slow drift pile up past the tolerance', () => {
    // цвет медленно уходит: сравниваем с тем, что на экране, поэтому ошибка не копится
    const steps = [
      [0, 0, 0],
      [4, 4, 4],
      [8, 8, 8],
      [12, 12, 12],
    ]
    const shown = new Uint8Array([0])
    const redrawn = [1, 2, 3].map(
      (i) => frameDelta(shown, new Uint8Array([i]), rgba([i], steps), 1, 1, steps, 3 * 6 * 6, T).pixels[0],
    )
    expect(redrawn).toEqual([T, 2, T])
    expect(shown[0]).toBe(2)
  })

  it('ignores noise that only flips a point between neighbouring colors', () => {
    // настоящий цвет дрожит около границы двух цветов палитры, а показанный остаётся рядом
    const pair = [
      [100, 100, 100],
      [120, 120, 120],
    ]
    const shown = new Uint8Array([0])
    const noisy = new Uint8ClampedArray([111, 111, 111, 255])
    expect(frameDelta(shown, new Uint8Array([1]), noisy, 1, 1, pair, 3 * 12 * 12, T).pixels[0]).toBe(T)
    expect(frameDelta(shown, new Uint8Array([1]), noisy, 1, 1, pair, 0, T).pixels[0]).toBe(1)
  })
})

describe('orderedDither', () => {
  it('keeps the same pattern in the same place on every frame', () => {
    const frame = new Uint8ClampedArray(8 * 8 * 4).fill(128)
    expect(orderedDither(frame, 8, 8, 32)).toEqual(orderedDither(frame, 8, 8, 32))
  })

  it('moves colors both ways around the original and leaves alpha alone', () => {
    const frame = new Uint8ClampedArray(4 * 4 * 4).fill(128)
    const out = orderedDither(frame, 4, 4, 32)
    const reds = Array.from({ length: 16 }, (_, i) => out[i * 4]!)
    expect(Math.min(...reds)).toBeLessThan(128)
    expect(Math.max(...reds)).toBeGreaterThan(128)
    // в среднем цвет не сдвигается
    expect(reds.reduce((s, v) => s + v, 0) / 16).toBeCloseTo(128, 0)
    expect(Array.from({ length: 16 }, (_, i) => out[i * 4 + 3])).toEqual(Array(16).fill(128))
  })

  it('does nothing without spread', () => {
    const frame = new Uint8ClampedArray([10, 20, 30, 255])
    expect(orderedDither(frame, 1, 1, 0)).toEqual(frame)
  })
})

describe('GIF_ATTEMPTS', () => {
  it('only ever gives up quality, never gets it back', () => {
    for (let i = 1; i < GIF_ATTEMPTS.length; i++) {
      const [was, now] = [GIF_ATTEMPTS[i - 1]!, GIF_ATTEMPTS[i]!]
      expect(now.colors).toBeLessThanOrEqual(was.colors)
      expect(now.tolerance).toBeGreaterThanOrEqual(was.tolerance)
    }
  })

  it('keeps room for the transparent color', () => {
    for (const attempt of GIF_ATTEMPTS) expect(attempt.colors).toBeLessThanOrEqual(256)
  })
})

describe('setFramePosition', () => {
  it('writes the offset into the frame descriptor', () => {
    const bytes = new Uint8Array([0x2c, 0, 0, 0, 0])
    setFramePosition(bytes, 0, 300, 2)
    expect(Array.from(bytes)).toEqual([0x2c, 44, 1, 2, 0])
  })

  it('refuses to write anywhere else', () => {
    expect(() => setFramePosition(new Uint8Array([0x21, 0, 0, 0, 0]), 0, 1, 1)).toThrow()
  })
})
