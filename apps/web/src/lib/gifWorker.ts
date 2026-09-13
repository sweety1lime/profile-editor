import { GIFEncoder, applyPalette, quantize } from 'gifenc'

type InitMessage = { type: 'init'; frames: Uint8ClampedArray[]; width: number; height: number }
type EncodeMessage = { type: 'encode'; indices: number[]; delays: number[]; limit: number; colors: number[] }

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<InitMessage | EncodeMessage>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

let frames: Uint8ClampedArray[] = []
let width = 0
let height = 0

const SAMPLE_FRAMES = 16
const SAMPLE_PIXEL_STEP = 4

// Палитра одна на всю гифку. Собираем её по нескольким кадрам, беря каждый четвёртый пиксель
function samplePixels(indices: number[]): Uint8Array {
  const picked = indices.filter((_, i) => i % Math.max(1, Math.ceil(indices.length / SAMPLE_FRAMES)) === 0)
  const pixels = width * height
  const out = new Uint8Array(picked.length * Math.ceil(pixels / SAMPLE_PIXEL_STEP) * 4)
  let o = 0
  for (const i of picked) {
    const frame = frames[i]!
    for (let p = 0; p < pixels; p += SAMPLE_PIXEL_STEP) {
      out[o++] = frame[p * 4]!
      out[o++] = frame[p * 4 + 1]!
      out[o++] = frame[p * 4 + 2]!
      out[o++] = 255
    }
  }
  return out.subarray(0, o)
}

function encode(indices: number[], delays: number[], maxColors: number, limit: number): Uint8Array | null {
  const palette = quantize(samplePixels(indices), maxColors)
  const gif = GIFEncoder()
  for (let n = 0; n < indices.length; n++) {
    const index = applyPalette(frames[indices[n]!]!, palette)
    gif.writeFrame(index, width, height, { palette: n === 0 ? palette : undefined, delay: delays[n]! * 10 })
    // уже не влезает, дальше кодировать нет смысла
    if (gif.bytesView().length > limit) return null
  }
  gif.finish()
  const bytes = gif.bytes()
  return bytes.length > limit ? null : bytes
}

scope.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    frames = msg.frames
    width = msg.width
    height = msg.height
    return
  }
  for (const colors of msg.colors) {
    const bytes = encode(msg.indices, msg.delays, colors, msg.limit)
    if (bytes) {
      scope.postMessage({ ok: true, bytes, colors }, [bytes.buffer as ArrayBuffer])
      return
    }
  }
  scope.postMessage({ ok: false })
}
