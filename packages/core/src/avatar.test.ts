import { describe, expect, it } from 'vitest'
import { MIN_AVATAR_CROP, clampAvatarCrop, defaultAvatarCrop, resizeAvatarCrop } from './avatar'

const inside = (crop: { x: number; y: number; size: number }, width: number, height: number) =>
  crop.x >= 0 && crop.y >= 0 && crop.x + crop.size <= width && crop.y + crop.size <= height

describe('clampAvatarCrop', () => {
  it('pulls a square that slid off the picture back inside', () => {
    expect(clampAvatarCrop({ x: -50, y: 900, size: 200 }, 1000, 1000)).toEqual({ x: 0, y: 800, size: 200 })
  })

  it('does not let the square outgrow the picture', () => {
    expect(clampAvatarCrop({ x: 0, y: 0, size: 5000 }, 800, 600)).toEqual({ x: 0, y: 0, size: 600 })
  })

  it('keeps a usable minimum', () => {
    expect(clampAvatarCrop({ x: 10, y: 10, size: 1 }, 800, 600).size).toBe(MIN_AVATAR_CROP)
  })

  it('copes with a picture smaller than the minimum', () => {
    expect(clampAvatarCrop({ x: 3, y: 3, size: 1 }, 10, 8)).toEqual({ x: 2, y: 0, size: 8 })
  })
})

describe('defaultAvatarCrop', () => {
  it('starts inside the picture, in its upper part', () => {
    for (const [width, height] of [
      [1920, 1080],
      [600, 1200],
      [300, 300],
    ] as const) {
      const crop = defaultAvatarCrop(width, height)
      expect(inside(crop, width, height)).toBe(true)
      expect(crop.y + crop.size / 2).toBeLessThan(height * 0.6)
    }
  })
})

describe('resizeAvatarCrop', () => {
  it('keeps the middle in place', () => {
    const next = resizeAvatarCrop({ x: 400, y: 400, size: 200 }, 100, 1000, 1000)
    expect(next).toEqual({ x: 450, y: 450, size: 100 })
  })

  it('stays inside near the edge', () => {
    const next = resizeAvatarCrop({ x: 0, y: 0, size: 100 }, 400, 1000, 1000)
    expect(inside(next, 1000, 1000)).toBe(true)
    expect(next.size).toBe(400)
  })
})
