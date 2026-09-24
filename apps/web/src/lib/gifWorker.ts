import type { GifAttempt } from '@profile-editor/core'
import { encodeFrames } from './gifEncode'

type InitMessage = { type: 'init'; frames: Uint8ClampedArray[]; width: number; height: number }
type EncodeMessage = { type: 'encode'; indices: number[]; delays: number[]; limit: number; attempts: GifAttempt[] }

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<InitMessage | EncodeMessage>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

let frames: Uint8ClampedArray[] = []
let width = 0
let height = 0

scope.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    frames = msg.frames
    width = msg.width
    height = msg.height
    return
  }
  // идём от лучшего качества к худшему, пока гифка не влезет
  for (const attempt of msg.attempts) {
    const bytes = encodeFrames(frames, width, height, msg.indices, msg.delays, {
      maxColors: attempt.colors,
      limit: msg.limit,
      tolerance: attempt.tolerance,
      dither: attempt.dither,
    })
    if (bytes) {
      scope.postMessage({ ok: true, bytes, colors: attempt.colors }, [bytes.buffer as ArrayBuffer])
      return
    }
  }
  scope.postMessage({ ok: false })
}
