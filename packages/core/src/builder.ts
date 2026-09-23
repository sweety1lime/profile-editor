// Слои конструктора и их анимации. Все координаты в пикселях витрины

export type AnimationKind = 'none' | 'float' | 'breathe' | 'sway' | 'pulse' | 'shake'

export const ANIMATIONS: AnimationKind[] = ['none', 'float', 'breathe', 'sway', 'pulse', 'shake']

export interface LayerBase {
  id: string
  name: string
  // центр слоя
  x: number
  y: number
  scale: number
  // градусы
  rotation: number
  opacity: number
  visible: boolean
  animation: AnimationKind
  // от 0 до 1
  strength: number
}

export interface ImageLayer extends LayerBase {
  type: 'image'
  assetId: string
  // картинка до вырезки фона, чтобы можно было вернуть как было
  originalAssetId?: string
  width: number
  height: number
}

export interface TextLayer extends LayerBase {
  type: 'text'
  text: string
  font: string
  size: number
  weight: number
  color: string
  stroke: number
  strokeColor: string
  glow: number
}

export type EffectKind = 'snow' | 'rain' | 'sakura' | 'embers' | 'stars'

export const EFFECTS: EffectKind[] = ['snow', 'rain', 'sakura', 'embers', 'stars']

// Частицы на всю витрину. Положение, размер и поворот из LayerBase у эффекта не используются
export interface EffectLayer extends LayerBase {
  type: 'effect'
  effect: EffectKind
  // от 0 до 1
  density: number
  speed: number
  // множитель размера частиц
  size: number
  // от -1 до 1, куда сносит частицы
  wind: number
  color: string
  seed: number
}

export type Layer = ImageLayer | TextLayer | EffectLayer

export interface Pose {
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
}

const TAU = Math.PI * 2

// Поза слоя в момент t, это доля цикла от 0 до 1.
// Все движения зациклены: в начале и в конце цикла поза одна и та же, гифка идёт без рывка
export function poseAt(layer: LayerBase, t: number): Pose {
  const pose: Pose = { x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation, opacity: layer.opacity }
  const s = layer.strength
  const wave = Math.sin(TAU * t)
  // 0 → 1 → 0 за цикл
  const rise = (1 - Math.cos(TAU * t)) / 2
  switch (layer.animation) {
    case 'float':
      pose.y += wave * 14 * s
      break
    case 'breathe':
      pose.scale *= 1 + 0.05 * s * rise
      break
    case 'sway':
      pose.rotation += wave * 8 * s
      break
    case 'pulse':
      pose.opacity *= 1 - 0.6 * s * rise
      break
    case 'shake':
      pose.x += Math.sin(TAU * t * 8) * 3 * s
      pose.y += Math.cos(TAU * t * 6) * 2 * s
      break
  }
  return pose
}

export const hasAnimation = (layers: Layer[]) =>
  layers.some(
    (layer) => layer.visible && (layer.type === 'effect' || (layer.animation !== 'none' && layer.strength > 0)),
  )

// Левый и правый край слоя на витрине с учётом поворота и масштаба
export function horizontalSpan(pose: Pose, width: number, height: number): { left: number; right: number } {
  const angle = (pose.rotation * Math.PI) / 180
  const half = (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height) * (pose.scale / 2)
  return { left: pose.x - half, right: pose.x + half }
}

// Попадает ли точка в слой с учётом поворота и масштаба. width и height — собственный размер слоя
export function containsPoint(pose: Pose, width: number, height: number, px: number, py: number): boolean {
  const angle = (-pose.rotation * Math.PI) / 180
  const dx = px - pose.x
  const dy = py - pose.y
  const lx = dx * Math.cos(angle) - dy * Math.sin(angle)
  const ly = dx * Math.sin(angle) + dy * Math.cos(angle)
  return Math.abs(lx) <= (width * pose.scale) / 2 && Math.abs(ly) <= (height * pose.scale) / 2
}

// Верхний видимый слой под точкой. Эффекты лежат на всей витрине, мышью их не выбираем
export function layerAt(
  layers: Layer[],
  sizeOf: (layer: Layer) => { width: number; height: number },
  px: number,
  py: number,
): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!
    if (!layer.visible || layer.type === 'effect') continue
    const { width, height } = sizeOf(layer)
    if (containsPoint(poseAt(layer, 0), width, height, px, py)) return layer
  }
  return null
}

// Сдвигает слой в списке: delta > 0 — выше, то есть ближе к зрителю
export function moveLayer(layers: Layer[], id: string, delta: number): Layer[] {
  const from = layers.findIndex((layer) => layer.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= layers.length) return layers
  const next = [...layers]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}
