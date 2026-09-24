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

export type BlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'soft-light' | 'lighter'

export const BLEND_MODES: BlendMode[] = ['normal', 'screen', 'multiply', 'overlay', 'soft-light', 'lighter']

export type FadeEdge = 'none' | 'bottom' | 'top' | 'left' | 'right' | 'around'

export const FADE_EDGES: FadeEdge[] = ['none', 'bottom', 'top', 'left', 'right', 'around']

// Оформление картинки: обводка, свечение и тень вокруг неё, растворение края и наложение на то,
// что под ней. Размеры в пикселях холста, а не картинки: обводка в 4 px остаётся 4 px при любом
// масштабе слоя, иначе у крупного исходника, уменьшенного до витрины, она бы пропадала
export interface ImageStyle {
  outline: number
  outlineColor: string
  glow: number
  glowColor: string
  shadow: number
  shadowColor: string
  shadowX: number
  shadowY: number
  fade: FadeEdge
  // доля картинки, на которой она растворяется, от 0 до 1
  fadeSize: number
  blend: BlendMode
}

export const DEFAULT_IMAGE_STYLE: ImageStyle = {
  outline: 0,
  outlineColor: '#ffffff',
  glow: 0,
  glowColor: '#ffffff',
  shadow: 0,
  shadowColor: '#000000',
  shadowX: 0,
  shadowY: 8,
  fade: 'none',
  fadeSize: 0.3,
  blend: 'normal',
}

export interface ImageLayer extends LayerBase {
  type: 'image'
  assetId: string
  // картинка до вырезки фона, чтобы можно было вернуть как было
  originalAssetId?: string
  width: number
  height: number
  // у слоёв из старых проектов оформления нет
  style?: ImageStyle
}

// Оформление слоя вместе с тем, чего в нём не задано
export const imageStyle = (layer: ImageLayer): ImageStyle => ({ ...DEFAULT_IMAGE_STYLE, ...layer.style })

// Есть ли что рисовать сверх самой картинки. Наложение сюда не входит: оно меняет не картинку,
// а то, как она ложится на холст
export const hasDecoration = (style: ImageStyle) =>
  style.outline > 0 || style.glow > 0 || style.shadow > 0 || (style.fade !== 'none' && style.fadeSize > 0)

// Сколько места вокруг картинки занимают обводка, свечение и тень. Размытие тени в канвасе
// заметно примерно на полтора своих радиуса, поэтому берём с запасом
export function stylePadding(style: ImageStyle): number {
  const glow = style.glow > 0 ? style.outline + style.glow * 1.5 : 0
  const shadow =
    style.shadow > 0 ? style.outline + style.shadow * 1.5 + Math.max(Math.abs(style.shadowX), Math.abs(style.shadowY)) : 0
  return Math.ceil(Math.max(style.outline, glow, shadow))
}

// Точки, в которые сдвигаем силуэт, чтобы получить обводку толщиной radius: кольцо по краю
// и ещё одно на полпути, иначе у мелких деталей тоньше обводки внутри остаются дырки
export function outlineOffsets(radius: number): { x: number; y: number }[] {
  if (radius <= 0) return []
  const rings = radius >= 4 ? [radius, radius / 2] : [radius]
  return rings.flatMap((r) => {
    const steps = Math.max(12, Math.ceil(Math.PI * 2 * r))
    return Array.from({ length: steps }, (_, i) => {
      const angle = (i / steps) * Math.PI * 2
      return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
    })
  })
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

// Прямоугольник, который слой занимает на холсте, с учётом поворота и масштаба
export function layerBounds(
  pose: Pose,
  width: number,
  height: number,
): { left: number; right: number; top: number; bottom: number } {
  const angle = (pose.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  const halfWidth = (cos * width + sin * height) * (pose.scale / 2)
  const halfHeight = (sin * width + cos * height) * (pose.scale / 2)
  return {
    left: pose.x - halfWidth,
    right: pose.x + halfWidth,
    top: pose.y - halfHeight,
    bottom: pose.y + halfHeight,
  }
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
