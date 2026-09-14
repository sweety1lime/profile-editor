import { extractPalette, type PaletteColor } from '@profile-editor/core'

const SIZE = 64

// Палитру считаем по уменьшенной копии, так же как у фонов в каталоге
export function paletteFromImage(image: CanvasImageSource, width: number, height: number): PaletteColor[] {
  const scale = Math.min(1, SIZE / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(image, 0, 0, w, h)
  return extractPalette(ctx.getImageData(0, 0, w, h).data, w * h)
}

export async function paletteFromFile(file: Blob): Promise<PaletteColor[]> {
  const bitmap = await createImageBitmap(file)
  try {
    return paletteFromImage(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}

export const colorToHex = (c: PaletteColor) => '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')

export function hexToPalette(hex: string): PaletteColor[] {
  const value = parseInt(hex.slice(1), 16)
  return [{ r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, weight: 1 }]
}
