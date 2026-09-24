import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { frameDelta, orderedDither, setFramePosition } from '@profile-editor/core'

// Кодирование одной части витрины в гифку. Живёт отдельно от воркера, чтобы его можно было
// проверить тестом: воркер только передаёт сюда кадры и отдаёт результат

export interface EncodeOptions {
  maxColors: number
  // сколько байт можно занять; перерос — бросаем, дальше кодировать бессмысленно
  limit: number
  // квадрат расстояния в RGB, до которого точку между кадрами не перерисовываем
  tolerance: number
  dither: boolean
}

const SAMPLE_FRAMES = 16
const SAMPLE_PIXEL_STEP = 4

// Палитра одна на всю гифку. Собираем её по нескольким кадрам, беря каждый четвёртый пиксель
function samplePixels(frames: Uint8ClampedArray[], indices: number[], pixels: number): Uint8Array {
  const picked = indices.filter((_, i) => i % Math.max(1, Math.ceil(indices.length / SAMPLE_FRAMES)) === 0)
  const out = new Uint8Array(picked.length * Math.ceil(pixels / SAMPLE_PIXEL_STEP) * 4)
  let o = 0
  for (const i of picked) {
    const frame = frames[i]!
    for (let p = 0; p < pixels; p += SAMPLE_PIXEL_STEP) {
      out[o++] = frame[p * 4]!
      out[o++] = frame[p * 4 + 1]!
      out[o++] = frame[p * 4 + 2]!
      out[o++] = 255
    }
  }
  return out.subarray(0, o)
}

// Размах дизеринга — примерно половина шага между соседними цветами, если бы палитра делила
// куб цветов поровну. У настоящей палитры цвета гуще там, где их много на картинке, так что
// шире не нужно: сетка станет заметнее полос, которые она прячет
export const ditherSpread = (colors: number) => 128 / Math.cbrt(colors)

export function encodeFrames(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  indices: number[],
  delays: number[],
  options: EncodeOptions,
): Uint8Array | null {
  // одно место в палитре оставляем под прозрачность
  const colors = quantize(samplePixels(frames, indices, width * height), options.maxColors - 1)
  const transparentIndex = colors.length
  const palette = [...colors, [0, 0, 0]]
  const spread = options.dither ? ditherSpread(colors.length) : 0

  const gif = GIFEncoder()
  let shown: Uint8Array | null = null
  for (let n = 0; n < indices.length; n++) {
    const source = frames[indices[n]!]!
    const index = applyPalette(spread ? orderedDither(source, width, height, spread) : source, colors)
    const delay = delays[n]! * 10
    // Кадры не стираются, каждый следующий ложится поверх: так прозрачные точки показывают прошлое
    if (!shown) {
      gif.writeFrame(index, width, height, { palette, delay, dispose: 1 })
      shown = index
    } else {
      const delta = frameDelta(shown, index, source, width, height, colors, options.tolerance, transparentIndex)
      // описание кадра идёт сразу за блоком с задержкой и прозрачностью, а он всегда 8 байт
      const descriptor = gif.bytesView().length + 8
      gif.writeFrame(delta.pixels, delta.width, delta.height, { delay, transparent: true, transparentIndex, dispose: 1 })
      setFramePosition(gif.bytesView(), descriptor, delta.x, delta.y)
    }
    if (gif.bytesView().length > options.limit) return null
  }
  gif.finish()
  const bytes = gif.bytes()
  return bytes.length > options.limit ? null : bytes
}
