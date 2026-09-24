import { describe, expect, it } from 'vitest'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { decompressFrames, parseGIF } from 'gifuct-js'
import { encodeFrames } from './gifEncode'

const W = 160
const H = 120
const FRAMES = 12
const LIMIT = 50 * 1024 * 1024

// Фон с узором, по которому ползёт красный квадрат: как персонаж на неподвижном арте
function background(x: number, y: number): [number, number, number] {
  return [Math.round(x * 1.5), Math.round(y * 2), ((x * 7 + y * 13) % 64) * 4]
}

const square = (n: number) => ({ x: 10 + n * 6, y: 50, size: 20 })

function makeFrames(noise = 0): Uint8ClampedArray[] {
  let seed = 1
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  return Array.from({ length: FRAMES }, (_, n) => {
    const frame = new Uint8ClampedArray(W * H * 4)
    const s = square(n)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = (y * W + x) * 4
        const inside = x >= s.x && x < s.x + s.size && y >= s.y && y < s.y + s.size
        const [r, g, b] = inside ? [230, 20, 20] : background(x, y)
        const jitter = noise ? Math.round(random() * noise) : 0
        frame[p] = r + jitter
        frame[p + 1] = g + jitter
        frame[p + 2] = b + jitter
        frame[p + 3] = 255
      }
    }
    return frame
  })
}

const all = Array.from({ length: FRAMES }, (_, i) => i)
const delays = Array(FRAMES).fill(10)

// Раскодируем и складываем кадры так же, как их покажет браузер: каждый поверх прошлого,
// прозрачные точки оставляют то, что было под ними
function play(bytes: Uint8Array): Uint8ClampedArray[] {
  const frames = decompressFrames(parseGIF(bytes.slice().buffer), true)
  const screen = new Uint8ClampedArray(W * H * 4)
  return frames.map((frame) => {
    const { left, top, width, height } = frame.dims
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from = (y * width + x) * 4
        if (frame.patch[from + 3] === 0) continue
        const to = ((top + y) * W + left + x) * 4
        screen[to] = frame.patch[from]!
        screen[to + 1] = frame.patch[from + 1]!
        screen[to + 2] = frame.patch[from + 2]!
        screen[to + 3] = 255
      }
    }
    return screen.slice()
  })
}

function meanError(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0
  for (let p = 0; p < a.length; p += 4) sum += Math.abs(a[p]! - b[p]!) + Math.abs(a[p + 1]! - b[p + 1]!) + Math.abs(a[p + 2]! - b[p + 2]!)
  return sum / ((a.length / 4) * 3)
}

// Как было раньше: каждый кадр целиком. Палитру для скорости берём по первому кадру
function naive(frames: Uint8ClampedArray[], colors: number) {
  const palette = quantize(frames[0]!, colors)
  const gif = GIFEncoder()
  frames.forEach((f, n) => gif.writeFrame(applyPalette(f, palette), W, H, { palette: n === 0 ? palette : undefined, delay: 100 }))
  gif.finish()
  return gif.bytes()
}

const options = { maxColors: 256, limit: LIMIT, tolerance: 0, dither: false }

describe('encodeFrames', () => {
  it('plays back the same animation it was given', () => {
    const frames = makeFrames()
    const shown = play(encodeFrames(frames, W, H, all, delays, options)!)
    expect(shown).toHaveLength(FRAMES)
    // первый кадр пишется целиком, его ошибка — это просто палитра; дельты не должны прибавлять
    const palette = meanError(shown[0]!, frames[0]!)
    shown.forEach((frame, n) => {
      expect(meanError(frame, frames[n]!)).toBeLessThan(palette + 0.5)
      // квадрат на своём месте, а там, где он был два кадра назад, снова фон. Остался бы квадрат —
      // красный отличался бы от фона на сотню, а палитра на пёстром фоне ошибается на пару десятков
      const s = square(n)
      const inside = ((s.y + 10) * W + s.x + 10) * 4
      expect(frame[inside]).toBeGreaterThan(200)
      expect(frame[inside + 1]).toBeLessThan(60)
      if (n >= 2) {
        const was = ((s.y + 10) * W + square(n - 2).x + 2) * 4
        const [r, g] = background(square(n - 2).x + 2, s.y + 10)
        expect(Math.abs(frame[was]! - r)).toBeLessThan(40)
        expect(Math.abs(frame[was + 1]! - g)).toBeLessThan(40)
      }
    })
  })

  it('takes far less room than writing every frame whole', () => {
    const frames = makeFrames()
    const optimized = encodeFrames(frames, W, H, all, delays, options)!
    expect(optimized.length * 3).toBeLessThan(naive(frames, 256).length)
  }, 20000)

  it('stops redrawing noise within the tolerance', () => {
    // у видео каждая точка чуть дрожит от кадра к кадру
    const frames = makeFrames(3)
    const strict = encodeFrames(frames, W, H, all, delays, options)!
    const lenient = encodeFrames(frames, W, H, all, delays, { ...options, tolerance: 3 * 16 * 16 })!
    expect(lenient.length * 2).toBeLessThan(strict.length)
    // ошибка остаётся в пределах допуска: 16 на канал в худшем случае, в среднем куда меньше
    const first = meanError(play(strict)[0]!, frames[0]!)
    play(lenient).forEach((frame, n) => expect(meanError(frame, frames[n]!)).toBeLessThan(first + 4))
  }, 20000)

  it('gives up as soon as the file outgrows the limit', () => {
    expect(encodeFrames(makeFrames(), W, H, all, delays, { ...options, limit: 1000 })).toBeNull()
  })

  it('hides banding on a smooth gradient with few colors', () => {
    // плавный переход на 16 цветах: без дизеринга полосы, с ним — сетка, которая издали сливается
    const gradient = new Uint8ClampedArray(W * H * 4)
    for (let p = 0; p < W * H; p++) {
      const x = p % W
      gradient[p * 4] = Math.round((x / W) * 255)
      gradient[p * 4 + 1] = 90
      gradient[p * 4 + 2] = Math.round(255 - (x / W) * 255)
      gradient[p * 4 + 3] = 255
    }
    // что видно издали: средний цвет квадратов 4×4
    const blurred = (img: Uint8ClampedArray) => {
      const out = new Uint8ClampedArray(img.length)
      for (let by = 0; by < H; by += 4) {
        for (let bx = 0; bx < W; bx += 4) {
          for (let c = 0; c < 3; c++) {
            let sum = 0
            for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) sum += img[((by + y) * W + bx + x) * 4 + c]!
            for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) out[((by + y) * W + bx + x) * 4 + c] = sum / 16
          }
        }
      }
      return out
    }
    const few = { ...options, maxColors: 16 }
    const plain = play(encodeFrames([gradient], W, H, [0], [10], few)!)[0]!
    const dithered = play(encodeFrames([gradient], W, H, [0], [10], { ...few, dither: true })!)[0]!
    expect(meanError(blurred(dithered), gradient)).toBeLessThan(meanError(blurred(plain), gradient))
  })
})
