import type { EffectKind, EffectLayer } from './builder'

// Эффекты сцены: снег, дождь, лепестки, искры, звёзды.
// Картина зависит только от seed и момента цикла t, поэтому в конце цикла частицы там же, где в начале

export const EFFECT_COLORS: Record<EffectKind, string> = {
  snow: '#ffffff',
  rain: '#a9c6ff',
  sakura: '#ffb7c9',
  embers: '#ff8a2b',
  stars: '#fff4c2',
}

interface Style {
  count: number
  // пикселей в секунду при средней скорости
  speed: number
  size: [number, number]
  // 1 — падают, -1 — поднимаются, 0 — стоят на месте
  direction: 1 | -1 | 0
  // размах покачивания в пикселях
  sway: number
}

const STYLES: Record<EffectKind, Style> = {
  snow: { count: 90, speed: 70, size: [1.5, 4], direction: 1, sway: 12 },
  rain: { count: 110, speed: 900, size: [14, 28], direction: 1, sway: 0 },
  sakura: { count: 42, speed: 80, size: [7, 13], direction: 1, sway: 24 },
  embers: { count: 45, speed: 55, size: [1, 2.6], direction: -1, sway: 6 },
  stars: { count: 60, speed: 0, size: [3, 8], direction: 0, sway: 0 },
}

export interface Particle {
  x: number
  y: number
  size: number
  // градусы: наклон струи дождя или поворот лепестка
  angle: number
  // от -1 до 1, лепесток переворачивается в воздухе
  flip: number
  alpha: number
  // от 0.4 до 1: дальние частицы мельче, медленнее и бледнее
  depth: number
}

const TAU = Math.PI * 2
// витрина иллюстраций, под неё подобраны количества
const REFERENCE_AREA = 615 * 700
export const MAX_PARTICLES = 400
// доля жизни частицы, за которую она появляется и тает
const FADE = 0.2

// mulberry32: быстрый генератор, одинаковый seed даёт одинаковую картину
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const fade = (u: number) => smooth(u / FADE) * smooth((1 - u) / FADE)
const wrap = (v: number) => v - Math.floor(v)

export function effectCount(layer: EffectLayer, width: number, height: number): number {
  const area = (width * height) / REFERENCE_AREA
  return Math.min(MAX_PARTICLES, Math.round(STYLES[layer.effect].count * (0.2 + 1.6 * layer.density) * area))
}

// Частицы в момент t (доля цикла от 0 до 1) для витрины width × height
export function effectParticles(
  layer: EffectLayer,
  width: number,
  height: number,
  loopSeconds: number,
  t: number,
): Particle[] {
  const style = STYLES[layer.effect]
  const next = random(layer.seed)
  const speed = style.speed * (0.25 + 1.5 * layer.speed)
  // сдвиг по горизонтали на каждый пиксель пути
  const slope = style.direction ? layer.wind * 0.8 : 0
  const tilt = (Math.atan(slope) * 180) / Math.PI
  const margin = style.size[1] * layer.size + style.sway + 4
  const count = effectCount(layer, width, height)
  const particles: Particle[] = []

  for (let i = 0; i < count; i++) {
    // каждой частице ровно семь случайных чисел: при смене плотности старые частицы остаются на местах
    const rx = next()
    const ry = next()
    const rs = next()
    const rd = next()
    const rp = next()
    const rw = next()
    const rv = next()

    const depth = 0.4 + 0.6 * rd
    const size = (style.size[0] + (style.size[1] - style.size[0]) * rs) * layer.size * (0.6 + 0.4 * depth)
    let alpha = 0.45 + 0.55 * depth

    if (style.direction === 0) {
      // звёзды стоят на местах и мерцают
      const cycles = rv < 0.5 ? 1 : 2
      alpha *= 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(TAU * (cycles * t + rp)))
      particles.push({ x: rx * width, y: ry * height, size, angle: 0, flip: 1, alpha, depth })
      continue
    }

    const travel = speed * depth * loopSeconds
    const length = height + margin * 2
    // сколько пути пройдено от точки появления и где эта точка по вертикали
    let path: number
    let start: number
    let span: number
    if (travel >= length * 0.75) {
      // быстрые частицы пролетают витрину целое число раз за цикл
      const passes = Math.max(1, Math.round(travel / length))
      path = wrap(ry + passes * t) * length
      start = -margin
      span = length
    } else {
      // медленные живут один цикл: появляются, пролетают немного и тают
      const u = wrap(t + rp)
      path = u * travel
      start = -travel + ry * (height + travel)
      span = travel
      alpha *= fade(u)
    }

    if (layer.effect === 'embers') alpha *= 0.6 + 0.4 * Math.sin(TAU * ((2 + Math.floor(rv * 3)) * t + rp))

    // ветер уводит частицы вбок, поэтому точки появления растягиваем в обратную сторону
    const drift = slope * span
    const x0 = Math.min(0, -drift) + rx * (width + Math.abs(drift))
    const sway = style.sway * depth * Math.sin(TAU * (t + rw))
    const down = start + path

    particles.push({
      x: x0 + slope * path + sway,
      y: style.direction === 1 ? down : height - down,
      size,
      angle: layer.effect === 'sakura' ? rv * 360 + (rv < 0.5 ? -360 : 360) * t : tilt,
      flip: layer.effect === 'sakura' ? Math.cos(TAU * (t + rw)) : 1,
      alpha,
      depth,
    })
  }
  return particles
}
