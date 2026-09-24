// Кадр гифки, в котором записано только то, что поменялось с прошлого кадра. Остальное прозрачно:
// кадр ложится поверх предыдущего, и неподвижный фон не пишется заново на каждом кадре. Ради этого
// в те же 5 МБ влезает куда больше кадров и цветов — обычно двигается только персонаж или частицы

export interface FrameDelta {
  x: number
  y: number
  width: number
  height: number
  // индексы цветов прямоугольника, неизменившиеся точки — прозрачным индексом
  pixels: Uint8Array
}

export type Palette = ArrayLike<ArrayLike<number>>

// Что поменялось между тем, что сейчас видно, и новым кадром. shown — индексы на экране, их
// обновляем на месте; next — индексы нового кадра, source — его настоящие цвета RGBA.
// tolerance — квадрат расстояния в RGB: пока цвет на экране отличается от настоящего не больше,
// точку не перерисовываем. У видео шум перекидывает почти каждую точку между соседними цветами
// палитры на каждом кадре, и без допуска записывать пришлось бы всё. Сравниваем с настоящим
// цветом, а не с прошлым кадром, поэтому ошибка не копится и не выходит за допуск
export function frameDelta(
  shown: Uint8Array,
  next: Uint8Array,
  source: ArrayLike<number>,
  width: number,
  height: number,
  palette: Palette,
  tolerance: number,
  transparentIndex: number,
): FrameDelta {
  const count = palette.length
  const r = new Int16Array(count)
  const g = new Int16Array(count)
  const b = new Int16Array(count)
  for (let i = 0; i < count; i++) {
    r[i] = palette[i]![0]!
    g[i] = palette[i]![1]!
    b[i] = palette[i]![2]!
  }

  const changed = new Uint8Array(width * height)
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0, p = 0; y < height; y++) {
    for (let x = 0; x < width; x++, p++) {
      const was = shown[p]!
      const now = next[p]!
      if (was === now) continue
      if (tolerance > 0) {
        const dr = r[was]! - source[p * 4]!
        const dg = g[was]! - source[p * 4 + 1]!
        const db = b[was]! - source[p * 4 + 2]!
        if (dr * dr + dg * dg + db * db <= tolerance) continue
      }
      changed[p] = 1
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  // ничего не поменялось, но кадр всё равно нужен, чтобы не сбить время
  if (right < 0) return { x: 0, y: 0, width: 1, height: 1, pixels: new Uint8Array([transparentIndex]) }

  const w = right - left + 1
  const h = bottom - top + 1
  const pixels = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (top + y) * width + left + x
      if (changed[p]) {
        pixels[y * w + x] = next[p]!
        shown[p] = next[p]!
      } else {
        pixels[y * w + x] = transparentIndex
      }
    }
  }
  return { x: left, y: top, width: w, height: h, pixels }
}

export interface GifAttempt {
  colors: number
  // см. frameDelta: квадрат расстояния в RGB
  tolerance: number
  dither: boolean
}

// Как ужимать гифку, если не влезает в лимит, — от лучшего к худшему. Сперва перестаём
// перерисовывать то, что на глаз не поменялось, потом урезаем палитру. На бедной палитре
// плавные переходы рвутся на полосы, там помогает дизеринг — но он и места просит больше,
// поэтому последней пробуем бедную палитру без него. Если не влезло совсем, кадры прорежут
export const GIF_ATTEMPTS: GifAttempt[] = [
  { colors: 256, tolerance: 3 * 4 * 4, dither: false },
  { colors: 256, tolerance: 3 * 10 * 10, dither: false },
  { colors: 192, tolerance: 3 * 10 * 10, dither: false },
  { colors: 128, tolerance: 3 * 10 * 10, dither: false },
  { colors: 128, tolerance: 3 * 16 * 16, dither: false },
  { colors: 96, tolerance: 3 * 16 * 16, dither: true },
  { colors: 64, tolerance: 3 * 16 * 16, dither: true },
  { colors: 64, tolerance: 3 * 16 * 16, dither: false },
]

// Узор 4×4 для упорядоченного дизеринга, значения от 0 до 15
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

// Упорядоченный дизеринг: к каждой точке прибавляем сдвиг из повторяющегося узора, и плавный
// переход в палитре на сотню цветов превращается в мелкую сетку вместо полос. Узор привязан к
// месту, а не к кадру, поэтому неподвижные точки из кадра в кадр остаются одинаковыми и не мешают
// писать только изменения. spread — размах сдвига, примерно шаг между соседними цветами палитры
export function orderedDither(rgba: Uint8ClampedArray, width: number, height: number, spread: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length)
  for (let y = 0, p = 0; y < height; y++) {
    const row = (y & 3) << 2
    for (let x = 0; x < width; x++, p += 4) {
      const shift = ((BAYER[row + (x & 3)]! + 0.5) / 16 - 0.5) * spread
      out[p] = rgba[p]! + shift
      out[p + 1] = rgba[p + 1]! + shift
      out[p + 2] = rgba[p + 2]! + shift
      out[p + 3] = rgba[p + 3]!
    }
  }
  return out
}

// Кодировщик пишет каждый кадр в левый верхний угол. Место кадра проставляем сами:
// descriptor — где в файле начинается описание кадра, байт 0x2C
export function setFramePosition(bytes: Uint8Array, descriptor: number, x: number, y: number) {
  if (bytes[descriptor] !== 0x2c) throw new Error('not an image descriptor')
  bytes[descriptor + 1] = x & 0xff
  bytes[descriptor + 2] = (x >> 8) & 0xff
  bytes[descriptor + 3] = y & 0xff
  bytes[descriptor + 4] = (y >> 8) & 0xff
}
