const GIF_TRAILER = 0x3b
const PATCHED_TRAILER = 0x21

export function isGif(bytes: Uint8Array): boolean {
  return (
    bytes.length > 6 &&
    bytes[0] === 0x47 && // G
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x38 // 8
  )
}

// Меняет последний байт гифки 0x3B на 0x21. После этого Steam не пережимает файл,
// и в мастерской с гайдами сохраняются пропорции и прозрачность.
export function patchGifTrailer(bytes: Uint8Array): Uint8Array {
  if (!isGif(bytes)) throw new Error('not a gif')
  const out = bytes.slice()
  const last = out.length - 1
  if (out[last] === GIF_TRAILER) out[last] = PATCHED_TRAILER
  return out
}
