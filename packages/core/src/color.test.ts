import { describe, expect, it } from 'vitest'
import { decodePalette, encodePalette, extractPalette, paletteDistance, rgbToLab, toLab } from './color'

// картинка из полосок заданных цветов, каждая шириной в заданное число пикселей
function stripes(parts: [number, number, number, number][]): { data: Uint8ClampedArray; pixels: number } {
  const pixels = parts.reduce((sum, p) => sum + p[3], 0)
  const data = new Uint8ClampedArray(pixels * 4)
  let o = 0
  for (const [r, g, b, count] of parts) {
    for (let i = 0; i < count; i++) {
      data.set([r, g, b, 255], o)
      o += 4
    }
  }
  return { data, pixels }
}

describe('rgbToLab', () => {
  it('matches reference values', () => {
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 1)
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 1)
    const red = rgbToLab(255, 0, 0)
    expect(red[0]).toBeCloseTo(53.24, 0)
    expect(red[1]).toBeCloseTo(80.09, 0)
  })
})

describe('extractPalette', () => {
  it('finds the main colors and their share', () => {
    const { data, pixels } = stripes([
      [220, 20, 30, 600],
      [20, 40, 200, 300],
      [250, 250, 250, 100],
    ])
    const palette = extractPalette(data, pixels)
    expect(palette).toHaveLength(3)
    expect(palette[0]).toMatchObject({ r: 220, g: 20, b: 30 })
    expect(palette[0]!.weight).toBeCloseTo(0.6, 2)
    expect(palette[1]!.weight).toBeCloseTo(0.3, 2)
  })

  it('skips transparent pixels', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 255])
    const palette = extractPalette(data, 2)
    expect(palette).toEqual([{ r: 0, g: 0, b: 255, weight: 1 }])
  })

  it('returns nothing for an empty image', () => {
    expect(extractPalette(new Uint8ClampedArray(0), 0)).toEqual([])
  })
})

describe('encodePalette / decodePalette', () => {
  it('round-trips', () => {
    const palette = [
      { r: 10, g: 200, b: 30, weight: 0.75 },
      { r: 255, g: 0, b: 128, weight: 0.25 },
    ]
    const text = encodePalette(palette)
    expect(text).toHaveLength(16)
    const back = decodePalette(text)
    expect(back[0]).toMatchObject({ r: 10, g: 200, b: 30 })
    expect(back[0]!.weight).toBeCloseTo(0.75, 2)
  })

  it('rejects garbage', () => {
    expect(decodePalette('zzzzzzzz')).toEqual([])
  })
})

describe('paletteDistance', () => {
  const red = toLab([{ r: 220, g: 30, b: 30, weight: 1 }])
  const darkRed = toLab([{ r: 150, g: 20, b: 20, weight: 1 }])
  const blue = toLab([{ r: 30, g: 30, b: 220, weight: 1 }])

  it('is zero for the same palette', () => {
    expect(paletteDistance(red, red)).toBe(0)
  })

  it('ranks similar colors closer', () => {
    expect(paletteDistance(red, darkRed)).toBeLessThan(paletteDistance(red, blue))
  })

  it('treats an empty palette as far away', () => {
    expect(paletteDistance(red, [])).toBe(Infinity)
  })
})
