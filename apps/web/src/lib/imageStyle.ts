import {
  hasDecoration,
  imageStyle,
  outlineOffsets,
  stylePadding,
  type FadeEdge,
  type ImageLayer,
  type ImageStyle,
} from '@profile-editor/core'

// Оформленная картинка: обводка, свечение, тень и растворение, запечённые в отдельный холст.
// Считается заново, только когда поменялся стиль или масштаб слоя, а на каждом кадре гифки
// рисуется одним drawImage. Размытие делаем тенью канваса, а не фильтром: тень есть везде,
// а фильтр в старых Safari молча не работает, и свечение превращается в плоскую заливку

export interface StyledImage {
  canvas: HTMLCanvasElement
  // во сколько раз холст мельче картинки на сцене: огромный слой считаем в пониженном размере
  resolution: number
}

// Больше такого холста браузеры дают не всегда, а слою крупнее витрины столько и не нужно
const MAX_SIDE = 4096

const cache = new WeakMap<ImageBitmap, Map<string, { key: string; styled: StyledImage }>>()

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function withAlpha(hex: string, alpha: number) {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

// Край растворяется плавно, а не по прямой: по прямой граница прозрачности читается полосой
const FADE_STOPS = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ t, alpha: 1 - t * t * (3 - 2 * t) }))

function fadeGradient(ctx: CanvasRenderingContext2D, edge: Exclude<FadeEdge, 'none' | 'around'>, size: number, box: Box) {
  const along = edge === 'left' || edge === 'right' ? box.width : box.height
  const length = along * size
  // градиент идёт от непрозрачного к краю картинки
  const line: Record<typeof edge, [number, number, number, number]> = {
    bottom: [0, box.y + box.height - length, 0, box.y + box.height],
    top: [0, box.y + length, 0, box.y],
    right: [box.x + box.width - length, 0, box.x + box.width, 0],
    left: [box.x + length, 0, box.x, 0],
  }
  const [x0, y0, x1, y1] = line[edge]
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const stop of FADE_STOPS) gradient.addColorStop(stop.t, `rgba(0, 0, 0, ${stop.alpha})`)
  return gradient
}

function applyFade(ctx: CanvasRenderingContext2D, edge: FadeEdge, size: number, box: Box) {
  if (edge === 'none') return
  const edges = edge === 'around' ? (['top', 'bottom', 'left', 'right'] as const) : [edge]
  ctx.save()
  // оставляем от уже нарисованного ровно столько, сколько непрозрачен градиент
  ctx.globalCompositeOperation = 'destination-in'
  for (const e of edges) {
    ctx.fillStyle = fadeGradient(ctx, e, size, box)
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  }
  ctx.restore()
}

function render(image: CanvasImageSource, layer: ImageLayer, style: ImageStyle): StyledImage {
  const sceneWidth = layer.width * layer.scale
  const sceneHeight = layer.height * layer.scale
  const padding = stylePadding(style)
  const resolution = Math.min(1, MAX_SIDE / (Math.max(sceneWidth, sceneHeight) + padding * 2))
  // пиксели сцены в пиксели холста
  const px = (value: number) => value * resolution
  const width = Math.max(1, Math.round(px(sceneWidth)))
  const height = Math.max(1, Math.round(px(sceneHeight)))
  const pad = Math.ceil(px(padding))
  const box = { x: pad, y: pad, width, height }

  // тело: обводка и сама картинка поверх неё
  const body = makeCanvas(width + pad * 2, height + pad * 2)
  const b = body.getContext('2d')!
  b.imageSmoothingQuality = 'high'
  if (style.outline > 0) {
    const silhouette = makeCanvas(width, height)
    const s = silhouette.getContext('2d')!
    s.imageSmoothingQuality = 'high'
    s.drawImage(image, 0, 0, width, height)
    s.globalCompositeOperation = 'source-in'
    s.fillStyle = style.outlineColor
    s.fillRect(0, 0, width, height)
    for (const offset of outlineOffsets(px(style.outline))) b.drawImage(silhouette, pad + offset.x, pad + offset.y)
  }
  b.drawImage(image, pad, pad, width, height)

  const out = makeCanvas(body.width, body.height)
  const ctx = out.getContext('2d')!
  // Тень и свечение — это тень канваса от тела. Само тело при этом рисуем за краем холста,
  // чтобы на холст легла только тень, а тело потом положить сверху один раз
  const far = body.width + 100
  const cast = (color: string, blur: number, dx: number, dy: number, times: number) => {
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = blur
    ctx.shadowOffsetX = far + dx
    ctx.shadowOffsetY = dy
    for (let i = 0; i < times; i++) ctx.drawImage(body, -far, 0)
    ctx.restore()
  }
  if (style.shadow > 0) cast(withAlpha(style.shadowColor, 0.75), px(style.shadow), px(style.shadowX), px(style.shadowY), 1)
  // одного прохода свечению мало, на тёмном фоне оно почти не видно
  if (style.glow > 0) cast(style.glowColor, px(style.glow), 0, 0, 2)
  ctx.drawImage(body, 0, 0)

  if (style.fadeSize > 0) applyFade(ctx, style.fade, style.fadeSize, box)
  return { canvas: out, resolution }
}

// Оформленная картинка слоя или null, если оформлять нечего и её можно рисовать как есть
export function styledImage(image: ImageBitmap, layer: ImageLayer): StyledImage | null {
  const style = imageStyle(layer)
  if (!hasDecoration(style)) return null
  const key = JSON.stringify([style, layer.width, layer.height, Math.round(layer.scale * 1000)])
  let byLayer = cache.get(image)
  if (!byLayer) cache.set(image, (byLayer = new Map()))
  const hit = byLayer.get(layer.id)
  if (hit?.key === key) return hit.styled
  const styled = render(image, layer, style)
  byLayer.set(layer.id, { key, styled })
  return styled
}

// Рисует картинку слоя в центре уже повёрнутого холста. scale — масштаб слоя в этом кадре
// вместе с анимацией
export function drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer, image: ImageBitmap, scale: number) {
  const style = imageStyle(layer)
  if (style.blend !== 'normal') ctx.globalCompositeOperation = style.blend
  const styled = styledImage(image, layer)
  if (!styled) {
    ctx.scale(scale, scale)
    ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
    return
  }
  // оформленная картинка уже в масштабе слоя, остаётся доля анимации и пониженный размер холста
  const k = scale / Math.max(layer.scale, 1e-3) / styled.resolution
  ctx.scale(k, k)
  ctx.drawImage(styled.canvas, -styled.canvas.width / 2, -styled.canvas.height / 2)
}
