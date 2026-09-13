import { describe, expect, it } from 'vitest'
import { isGif, patchGifTrailer } from './gif'

// заголовок GIF89a, логический экран 1x1 и сразу конец файла
const tinyGif = () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x3b])

describe('patchGifTrailer', () => {
  it('replaces the trailer with 0x21', () => {
    const src = tinyGif()
    const out = patchGifTrailer(src)
    expect(out[out.length - 1]).toBe(0x21)
    expect(out.length).toBe(src.length)
  })

  it('does not touch the original buffer', () => {
    const src = tinyGif()
    patchGifTrailer(src)
    expect(src[src.length - 1]).toBe(0x3b)
  })

  it('leaves an already patched file as is', () => {
    const once = patchGifTrailer(tinyGif())
    expect(patchGifTrailer(once)).toEqual(once)
  })

  it('throws on non-gif input', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(isGif(png)).toBe(false)
    expect(() => patchGifTrailer(png)).toThrow()
  })
})
