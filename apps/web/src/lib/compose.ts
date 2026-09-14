import { SHOWCASES, poseAt, type Frame, type Layer, type ShowcaseKind, type TextLayer } from '@profile-editor/core'
import type { AnimatedSource } from './animated'
import type { Source } from './source'

// Сцена конструктора: фон и слои поверх него, размер как у витрины

export interface Scene {
  kind: ShowcaseKind
  height: number
  layers: Layer[]
  durationMs: number
  fps: number
}

export interface SceneBackground {
  image: CanvasImageSource
  frame: Frame
}

export const sceneWidth = (kind: ShowcaseKind) => Math.ceil(SHOWCASES[kind].width)

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

// Собственный размер слоя, без масштаба и поворота
export function layerSize(layer: Layer): { width: number; height: number } {
  return layer.type === 'image' ? { width: layer.width, height: layer.height } : textSize(layer)
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
  const width = sceneWidth(scene.kind)
  ctx.clearRect(0, 0, width, scene.height)
  if (background) {
    const { image, frame } = background
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, frame.x, frame.y, width * frame.scale, scene.height * frame.scale, 0, 0, width, scene.height)
  }
  for (const layer of scene.layers) {
    if (!layer.visible) continue
    const pose = poseAt(layer, t)
    ctx.save()
    ctx.globalAlpha = pose.opacity
    ctx.translate(pose.x, pose.y)
    ctx.rotate((pose.rotation * Math.PI) / 180)
    ctx.scale(pose.scale, pose.scale)
    if (layer.type === 'image') {
      const image = assets.get(layer.assetId)
      if (image) ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
    } else {
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
  const width = sceneWidth(scene.kind)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = scene.height
  const ctx = canvas.getContext('2d')!
  const duration = scene.durationMs / 1000

  return {
    type: 'animated',
    name: 'scene',
    blob: new Blob(),
    width,
    height: scene.height,
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
