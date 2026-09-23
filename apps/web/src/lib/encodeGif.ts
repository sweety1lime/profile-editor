import {
  patchGifTrailer,
  sliceRects,
  stepForBudget,
  thinFrames,
  type Frame,
  type ShowcaseKind,
  type Timeline,
} from '@profile-editor/core'
import type { AnimatedSource } from './animated'

export type Progress = { stage: 'frames'; done: number; total: number } | { stage: 'encode'; attempt: number }

export interface GifPart {
  name: string
  bytes: Uint8Array
  colors: number
}

export interface GifResult {
  parts: GifPart[]
  step: number
  frameCount: number
  delays: number[]
}

const COLOR_STEPS = [256, 192, 128, 96, 64]
const MAX_THIN_STEP = 3

type EncodeReply = { ok: true; bytes: Uint8Array; colors: number } | { ok: false }

class PartEncoder {
  private worker = new Worker(new URL('./gifWorker.ts', import.meta.url), { type: 'module' })

  constructor(frames: Uint8ClampedArray[], width: number, height: number) {
    this.worker.postMessage(
      { type: 'init', frames, width, height },
      frames.map((f) => f.buffer as ArrayBuffer),
    )
  }

  encode(indices: number[], delays: number[], limit: number): Promise<EncodeReply> {
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (e: MessageEvent<EncodeReply>) => resolve(e.data)
      this.worker.onerror = (e) => reject(e)
      this.worker.postMessage({ type: 'encode', indices, delays, limit, colors: COLOR_STEPS })
    })
  }

  terminate() {
    this.worker.terminate()
  }
}

// Режет каждый кадр на части витрины и собирает из частей гифки.
// Если какая-то часть не влезает даже на 64 цветах, прореживаем кадры сразу у всех частей,
// иначе они перестанут совпадать по времени
export async function encodeAnimated(
  source: AnimatedSource,
  kind: ShowcaseKind,
  frame: Frame,
  timeline: Timeline,
  options: { limit: number; hex: boolean },
  onProgress: (progress: Progress) => void,
): Promise<GifResult | null> {
  const rects = sliceRects(kind, frame)

  // Высокая витрина на многих кадрах не помещается в память целиком, поэтому лишние кадры
  // убираем сразу: нарисовать и уронить вкладку хуже, чем собрать анимацию пореже
  const bytesPerFrame = rects.reduce((sum, r) => sum + r.outWidth * r.outHeight * 4, 0)
  const budgetStep = stepForBudget(timeline.timestamps.length, bytesPerFrame)
  const grid =
    budgetStep === 1
      ? timeline
      : (() => {
          const thin = thinFrames(timeline.delays, budgetStep)
          return { timestamps: thin.indices.map((i) => timeline.timestamps[i]!), delays: thin.delays }
        })()

  const contexts = rects.map((r) => new OffscreenCanvas(r.outWidth, r.outHeight).getContext('2d', { willReadFrequently: true })!)
  const partFrames: Uint8ClampedArray[][] = rects.map(() => [])
  const total = grid.timestamps.length

  let done = 0
  for await (const image of source.frames(grid.timestamps)) {
    rects.forEach((r, p) => {
      const ctx = contexts[p]!
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, r.outWidth, r.outHeight)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, r.outWidth, r.outHeight)
      partFrames[p]!.push(ctx.getImageData(0, 0, r.outWidth, r.outHeight).data)
    })
    onProgress({ stage: 'frames', done: ++done, total })
  }

  const encoders = rects.map((r, p) => new PartEncoder(partFrames[p]!, r.outWidth, r.outHeight))
  try {
    for (let step = 1; step <= MAX_THIN_STEP; step++) {
      onProgress({ stage: 'encode', attempt: step })
      const thin = thinFrames(grid.delays, step)
      const replies = await Promise.all(encoders.map((e) => e.encode(thin.indices, thin.delays, options.limit)))
      if (replies.every((r) => r.ok)) {
        return {
          parts: replies.map((reply, p) => {
            const ok = reply as Extract<EncodeReply, { ok: true }>
            return {
              name: rects[p]!.name,
              bytes: options.hex ? patchGifTrailer(ok.bytes) : ok.bytes,
              colors: ok.colors,
            }
          }),
          step: step * budgetStep,
          frameCount: thin.indices.length,
          delays: thin.delays,
        }
      }
    }
    return null
  } finally {
    for (const e of encoders) e.terminate()
  }
}
