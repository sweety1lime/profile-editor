import { describe, expect, it } from 'vitest'
import {
  ANIMATIONS,
  DEFAULT_IMAGE_STYLE,
  containsPoint,
  hasAnimation,
  hasDecoration,
  imageStyle,
  layerAt,
  layerBounds,
  moveLayer,
  outlineOffsets,
  poseAt,
  stylePadding,
  type Layer,
  type LayerBase,
} from './builder'

const base = (patch: Partial<LayerBase> = {}): LayerBase => ({
  id: 'a',
  name: 'a',
  x: 100,
  y: 100,
  scale: 1,
  rotation: 0,
  opacity: 1,
  visible: true,
  animation: 'none',
  strength: 1,
  ...patch,
})

const image = (id: string, patch: Partial<LayerBase> = {}): Layer => ({
  ...base({ id, name: id, ...patch }),
  type: 'image',
  assetId: id,
  width: 100,
  height: 50,
})

describe('poseAt', () => {
  it('every animation loops back to the start', () => {
    for (const animation of ANIMATIONS) {
      const layer = base({ animation })
      const start = poseAt(layer, 0)
      const end = poseAt(layer, 1)
      for (const key of Object.keys(start) as (keyof typeof start)[]) {
        expect(end[key]).toBeCloseTo(start[key], 6)
      }
    }
  })

  it('float moves the layer up and down', () => {
    const layer = base({ animation: 'float' })
    expect(poseAt(layer, 0.25).y).toBeCloseTo(114)
    expect(poseAt(layer, 0.75).y).toBeCloseTo(86)
  })

  it('strength zero means no motion', () => {
    const layer = base({ animation: 'sway', strength: 0 })
    expect(poseAt(layer, 0.25).rotation).toBe(0)
  })
})

describe('containsPoint', () => {
  const pose = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }

  it('checks the box around the center', () => {
    expect(containsPoint(pose, 100, 50, 49, 24)).toBe(true)
    expect(containsPoint(pose, 100, 50, 49, 26)).toBe(false)
  })

  it('takes rotation into account', () => {
    const turned = { ...pose, rotation: 90 }
    expect(containsPoint(turned, 100, 50, 24, 49)).toBe(true)
    expect(containsPoint(turned, 100, 50, 49, 24)).toBe(false)
  })

  it('takes scale into account', () => {
    expect(containsPoint({ ...pose, scale: 2 }, 100, 50, 99, 0)).toBe(true)
  })
})

describe('layerAt', () => {
  const sizeOf = () => ({ width: 100, height: 50 })

  it('picks the topmost visible layer', () => {
    const layers = [image('bottom'), image('top')]
    expect(layerAt(layers, sizeOf, 100, 100)?.id).toBe('top')
    expect(layerAt([image('bottom'), image('top', { visible: false })], sizeOf, 100, 100)?.id).toBe('bottom')
    expect(layerAt(layers, sizeOf, 400, 400)).toBeNull()
  })
})

describe('moveLayer', () => {
  it('reorders and ignores moves past the edges', () => {
    const layers = [image('a'), image('b'), image('c')]
    expect(moveLayer(layers, 'a', 1).map((l) => l.id)).toEqual(['b', 'a', 'c'])
    expect(moveLayer(layers, 'c', 1)).toBe(layers)
  })
})

describe('hasAnimation', () => {
  it('ignores hidden and zero-strength layers', () => {
    expect(hasAnimation([image('a', { animation: 'float' })])).toBe(true)
    expect(hasAnimation([image('a', { animation: 'float', visible: false })])).toBe(false)
    expect(hasAnimation([image('a', { animation: 'float', strength: 0 })])).toBe(false)
  })
})

describe('layerBounds', () => {
  const pose = { x: 100, y: 50, scale: 1, rotation: 0, opacity: 1 }

  it('is the layer itself when nothing is turned', () => {
    expect(layerBounds(pose, 40, 20)).toEqual({ left: 80, right: 120, top: 40, bottom: 60 })
  })

  it('swaps the sides on a quarter turn', () => {
    const turned = layerBounds({ ...pose, rotation: 90 }, 40, 20)
    expect(turned.right - turned.left).toBeCloseTo(20)
    expect(turned.bottom - turned.top).toBeCloseTo(40)
  })
})

describe('imageStyle', () => {
  const layer = {
    id: 'i1',
    name: 'арт',
    type: 'image' as const,
    assetId: 'a1',
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    animation: 'none' as const,
    strength: 0,
  }

  it('gives an old layer the plain look', () => {
    expect(imageStyle(layer)).toEqual(DEFAULT_IMAGE_STYLE)
    expect(hasDecoration(imageStyle(layer))).toBe(false)
    expect(stylePadding(imageStyle(layer))).toBe(0)
  })

  it('keeps what the layer sets', () => {
    const style = imageStyle({ ...layer, style: { ...DEFAULT_IMAGE_STYLE, outline: 6, outlineColor: '#ff0000' } })
    expect(style.outline).toBe(6)
    expect(style.outlineColor).toBe('#ff0000')
    expect(hasDecoration(style)).toBe(true)
  })

  it('does not count blending as decoration', () => {
    expect(hasDecoration({ ...DEFAULT_IMAGE_STYLE, blend: 'screen' })).toBe(false)
    expect(hasDecoration({ ...DEFAULT_IMAGE_STYLE, fade: 'bottom', fadeSize: 0 })).toBe(false)
    expect(hasDecoration({ ...DEFAULT_IMAGE_STYLE, fade: 'bottom' })).toBe(true)
  })
})

describe('stylePadding', () => {
  it('leaves room for the outline', () => {
    expect(stylePadding({ ...DEFAULT_IMAGE_STYLE, outline: 6 })).toBe(6)
  })

  it('leaves room for the blur and the offset of the shadow', () => {
    const padding = stylePadding({ ...DEFAULT_IMAGE_STYLE, shadow: 10, shadowX: -20, shadowY: 5 })
    expect(padding).toBeGreaterThanOrEqual(10 + 20)
  })

  it('stacks the glow on top of the outline', () => {
    expect(stylePadding({ ...DEFAULT_IMAGE_STYLE, outline: 4, glow: 10 })).toBeGreaterThan(14)
  })
})

describe('outlineOffsets', () => {
  const distance = (p: { x: number; y: number }) => Math.hypot(p.x, p.y)

  it('has nothing to shift without an outline', () => {
    expect(outlineOffsets(0)).toEqual([])
  })

  it('walks around the silhouette at the outline width', () => {
    const points = outlineOffsets(2)
    expect(points.length).toBeGreaterThanOrEqual(12)
    for (const p of points) expect(distance(p)).toBeCloseTo(2)
  })

  it('adds an inner ring for thick outlines', () => {
    const points = outlineOffsets(8)
    expect(Math.max(...points.map(distance))).toBeCloseTo(8)
    expect(points.some((p) => Math.abs(distance(p) - 4) < 1e-9)).toBe(true)
  })
})
