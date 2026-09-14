// Палитры для подбора фона по цвету. Считаем в Lab: там расстояние между цветами
// ближе к тому, как разницу видит глаз. Файл без импортов, его же подключает скрипт каталога

export interface PaletteColor {
  r: number
  g: number
  b: number
  weight: number
}

export interface LabColor {
  l: number
  a: number
  b: number
  weight: number
}

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = toLinear(r)
  const G = toLinear(g)
  const B = toLinear(b)
  const x = labF((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047)
  const y = labF(R * 0.2126 + G * 0.7152 + B * 0.0722)
  const z = labF((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

// мелкие кластеры, меньше 2% картинки, в палитру не берём
const MIN_WEIGHT = 0.02

// k-средних по пикселям картинки. Первый центр — средний цвет, следующие — самые далёкие
// от уже выбранных, так в палитру попадают разные оттенки, а результат не зависит от случая
export function extractPalette(rgba: ArrayLike<number>, pixels: number, k = 5, iterations = 10): PaletteColor[] {
  const lab: number[] = []
  const rgb: number[] = []
  for (let p = 0; p < pixels; p++) {
    const o = p * 4
    if ((rgba[o + 3] ?? 255) < 128) continue
    const r = rgba[o] ?? 0
    const g = rgba[o + 1] ?? 0
    const b = rgba[o + 2] ?? 0
    lab.push(...rgbToLab(r, g, b))
    rgb.push(r, g, b)
  }
  const n = lab.length / 3
  if (!n) return []

  const centers: number[] = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    centers[0]! += lab[i * 3]! / n
    centers[1]! += lab[i * 3 + 1]! / n
    centers[2]! += lab[i * 3 + 2]! / n
  }
  const dist = (i: number, c: number) => {
    const dl = lab[i * 3]! - centers[c * 3]!
    const da = lab[i * 3 + 1]! - centers[c * 3 + 1]!
    const db = lab[i * 3 + 2]! - centers[c * 3 + 2]!
    return dl * dl + da * da + db * db
  }

  const nearest = new Float64Array(n).fill(Infinity)
  while (centers.length / 3 < k) {
    const last = centers.length / 3 - 1
    let far = -1
    let farDist = 0
    for (let i = 0; i < n; i++) {
      const d = dist(i, last)
      if (d < nearest[i]!) nearest[i] = d
      if (nearest[i]! > farDist) {
        farDist = nearest[i]!
        far = i
      }
    }
    // все пиксели уже рядом с каким-то центром
    if (far < 0 || farDist < 4) break
    centers.push(lab[far * 3]!, lab[far * 3 + 1]!, lab[far * 3 + 2]!)
  }

  const count = centers.length / 3
  const assign = new Int32Array(n)
  for (let it = 0; it < iterations; it++) {
    const sums = new Float64Array(count * 3)
    const sizes = new Float64Array(count)
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < count; c++) {
        const d = dist(i, c)
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      assign[i] = best
      sizes[best]!++
      sums[best * 3]! += lab[i * 3]!
      sums[best * 3 + 1]! += lab[i * 3 + 1]!
      sums[best * 3 + 2]! += lab[i * 3 + 2]!
    }
    for (let c = 0; c < count; c++) {
      if (!sizes[c]) continue
      centers[c * 3] = sums[c * 3]! / sizes[c]!
      centers[c * 3 + 1] = sums[c * 3 + 1]! / sizes[c]!
      centers[c * 3 + 2] = sums[c * 3 + 2]! / sizes[c]!
    }
  }

  // цвет кластера берём как средний RGB его пикселей, так не нужен обратный перевод из Lab
  const rgbSums = new Float64Array(count * 3)
  const sizes = new Float64Array(count)
  for (let i = 0; i < n; i++) {
    const c = assign[i]!
    sizes[c]!++
    rgbSums[c * 3]! += rgb[i * 3]!
    rgbSums[c * 3 + 1]! += rgb[i * 3 + 1]!
    rgbSums[c * 3 + 2]! += rgb[i * 3 + 2]!
  }
  const palette: PaletteColor[] = []
  for (let c = 0; c < count; c++) {
    const size = sizes[c]!
    if (size / n < MIN_WEIGHT) continue
    palette.push({
      r: Math.round(rgbSums[c * 3]! / size),
      g: Math.round(rgbSums[c * 3 + 1]! / size),
      b: Math.round(rgbSums[c * 3 + 2]! / size),
      weight: size / n,
    })
  }
  return normalize(palette).sort((x, y) => y.weight - x.weight)
}

function normalize(palette: PaletteColor[]): PaletteColor[] {
  const total = palette.reduce((sum, c) => sum + c.weight, 0) || 1
  return palette.map((c) => ({ ...c, weight: c.weight / total }))
}

const hex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')

// По 8 символов на цвет: rrggbb и вес от 0 до 255
export function encodePalette(palette: PaletteColor[]): string {
  return palette.map((c) => hex(c.r) + hex(c.g) + hex(c.b) + hex(c.weight * 255)).join('')
}

export function decodePalette(text: string): PaletteColor[] {
  const palette: PaletteColor[] = []
  for (let i = 0; i + 8 <= text.length; i += 8) {
    const part = text.slice(i, i + 8)
    if (!/^[0-9a-f]{8}$/i.test(part)) return []
    palette.push({
      r: parseInt(part.slice(0, 2), 16),
      g: parseInt(part.slice(2, 4), 16),
      b: parseInt(part.slice(4, 6), 16),
      weight: parseInt(part.slice(6, 8), 16) / 255,
    })
  }
  return normalize(palette)
}

export const toLab = (palette: PaletteColor[]): LabColor[] =>
  palette.map((c) => {
    const [l, a, b] = rgbToLab(c.r, c.g, c.b)
    return { l, a, b, weight: c.weight }
  })

function oneWay(from: LabColor[], to: LabColor[]): number {
  let sum = 0
  for (const c of from) {
    let best = Infinity
    for (const d of to) {
      const e = (c.l - d.l) ** 2 + (c.a - d.a) ** 2 + (c.b - d.b) ** 2
      if (e < best) best = e
    }
    sum += c.weight * Math.sqrt(best)
  }
  return sum
}

// Меньше — похожее. Считаем в обе стороны, чтобы у фона не было много чужих цветов
export function paletteDistance(a: LabColor[], b: LabColor[]): number {
  if (!a.length || !b.length) return Infinity
  return (oneWay(a, b) + oneWay(b, a)) / 2
}
