import {
  effectParticles,
  poseAt,
  type EffectLayer,
  type Frame,
  type Layer,
  type SceneBox,
  type TextLayer,
} from '@profile-editor/core'
import type { AnimatedSource } from './animated'
import { drawImageLayer } from './imageStyle'
import type { Source } from './source'

// Сцена конструктора: фон и слои поверх него. Размер и окна витрин берутся из холста,
// поэтому одна и та же сцена собирается и под одну витрину, и на весь профиль

export interface Scene {
  box: SceneBox
  layers: Layer[]
  durationMs: number
  fps: number
}

export interface SceneBackground {
  image: CanvasImageSource
  frame: Frame
}

const LINE_HEIGHT = 1.2

export const textFont = (layer: TextLayer) => `${layer.weight} ${layer.size}px "${layer.font}", sans-serif`

let measureContext: CanvasRenderingContext2D | null = null

function textSize(layer: TextLayer) {
  measureContext ??= document.createElement('canvas').getContext('2d')
  const lines = layer.text.split('\n')
  let width = layer.size * 0.6 * Math.max(...lines.map((line) => line.length))
  if (measureContext) {
    measureContext.font = textFont(layer)
    width = Math.max(...lines.map((line) => measureContext!.measureText(line).width))
  }
  return {
    width: Math.max(1, width + layer.stroke * 2),
    height: Math.max(1, lines.length * layer.size * LINE_HEIGHT + layer.stroke * 2),
  }
}

// Собственный размер слоя, без масштаба и поворота. У эффекта своей рамки нет
export function layerSize(layer: Layer): { width: number; height: number } {
  if (layer.type === 'image') return { width: layer.width, height: layer.height }
  if (layer.type === 'text') return textSize(layer)
  return { width: 0, height: 0 }
}

function petal(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.moveTo(0, s)
  ctx.bezierCurveTo(s * 0.9, s * 0.4, s * 0.7, -s * 0.7, s * 0.18, -s)
  // выемка на кончике лепестка
  ctx.lineTo(0, -s * 0.78)
  ctx.lineTo(-s * 0.18, -s)
  ctx.bezierCurveTo(-s * 0.7, -s * 0.7, -s * 0.9, s * 0.4, 0, s)
  ctx.fill()
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.quadraticCurveTo(x, y, x + s, y)
  ctx.quadraticCurveTo(x, y, x, y + s)
  ctx.quadraticCurveTo(x, y, x - s, y)
  ctx.quadraticCurveTo(x, y, x, y - s)
  ctx.fill()
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function drawEffect(ctx: CanvasRenderingContext2D, layer: EffectLayer, width: number, height: number, t: number, loopSeconds: number) {
  ctx.save()
  ctx.fillStyle = layer.color
  ctx.strokeStyle = layer.color
  ctx.lineCap = 'round'
  // искры и звёзды светятся, поэтому складываем их с тем, что под ними
  if (layer.effect === 'embers' || layer.effect === 'stars') ctx.globalCompositeOperation = 'lighter'

  for (const p of effectParticles(layer, width, height, loopSeconds, t)) {
    const alpha = layer.opacity * p.alpha
    if (alpha < 0.01) continue
    ctx.globalAlpha = alpha
    switch (layer.effect) {
      case 'snow':
        dot(ctx, p.x, p.y, p.size)
        ctx.globalAlpha = alpha * 0.25
        dot(ctx, p.x, p.y, p.size * 1.8)
        break
      case 'rain': {
        const angle = (p.angle * Math.PI) / 180
        ctx.lineWidth = 0.6 + p.depth
        ctx.globalAlpha = alpha * 0.6
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - Math.sin(angle) * p.size, p.y - Math.cos(angle) * p.size)
        ctx.stroke()
        break
      }
      case 'sakura':
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.angle * Math.PI) / 180)
        ctx.scale(p.flip, 1)
        petal(ctx, p.size)
        ctx.restore()
        break
      case 'embers':
        ctx.globalAlpha = alpha * 0.3
        dot(ctx, p.x, p.y, p.size * 3)
        ctx.globalAlpha = alpha
        dot(ctx, p.x, p.y, p.size)
        break
      case 'stars':
        sparkle(ctx, p.x, p.y, p.size)
        ctx.globalAlpha = alpha * 0.4
        dot(ctx, p.x, p.y, p.size * 0.45)
        break
    }
  }
  ctx.restore()
}

function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  ctx.font = textFont(layer)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const lines = layer.text.split('\n')
  const step = layer.size * LINE_HEIGHT
  const top = -((lines.length - 1) * step) / 2
  lines.forEach((line, i) => {
    const y = top + i * step
    // свечение рисуем вместе с первым проходом, дальше тень выключаем, чтобы текст оставался чётким
    ctx.shadowColor = layer.color
    ctx.shadowBlur = layer.glow
    if (layer.stroke > 0) {
      ctx.lineWidth = layer.stroke * 2
      ctx.strokeStyle = layer.strokeColor
      ctx.strokeText(line, 0, y)
      ctx.shadowBlur = 0
    }
    ctx.fillStyle = layer.color
    ctx.fillText(line, 0, y)
    ctx.shadowBlur = 0
  })
}

// Рисует сцену в момент t (доля цикла от 0 до 1)
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  t: number,
  background: SceneBackground | null,
  assets: Map<string, ImageBitmap>,
) {
  const { width, height } = scene.box
  ctx.clearRect(0, 0, width, height)
  if (background) {
    const { image, frame } = background
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, frame.x, frame.y, width * frame.scale, height * frame.scale, 0, 0, width, height)
  }
  for (const layer of scene.layers) {
    if (!layer.visible) continue
    if (layer.type === 'effect') {
      drawEffect(ctx, layer, width, height, t, scene.durationMs / 1000)
      continue
    }
    const pose = poseAt(layer, t)
    ctx.save()
    ctx.globalAlpha = pose.opacity
    ctx.translate(pose.x, pose.y)
    ctx.rotate((pose.rotation * Math.PI) / 180)
    if (layer.type === 'image') {
      const image = assets.get(layer.assetId)
      if (image) drawImageLayer(ctx, layer, image, pose.scale)
    } else {
      ctx.scale(pose.scale, pose.scale)
      drawText(ctx, layer)
    }
    ctx.restore()
  }
}

// Сцена в виде анимированного исходника, чтобы собирать гифки тем же кодом, что и в нарезчике
export function sceneSource(
  scene: Scene,
  background: { source: Source; frame: Frame } | null,
  assets: Map<string, ImageBitmap>,
): AnimatedSource {
  const { width, height } = scene.box
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const duration = scene.durationMs / 1000

  return {
    type: 'animated',
    name: 'scene',
    blob: new Blob(),
    width,
    height,
    duration,
    fps: scene.fps,
    poster: canvas,
    async *frames(timestamps) {
      const source = background?.source
      const backgroundFrames = source?.type === 'animated' ? source.frames(timestamps) : null
      for (const timestamp of timestamps) {
        let image: CanvasImageSource | undefined
        if (backgroundFrames) image = (await backgroundFrames.next()).value ?? undefined
        else if (source?.type === 'still') image = source.image
        drawScene(
          ctx,
          scene,
          (timestamp % duration) / duration,
          image && background ? { image, frame: background.frame } : null,
          assets,
        )
        yield canvas
      }
    },
    dispose() {},
  }
}
