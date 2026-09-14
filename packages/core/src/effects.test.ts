import { describe, expect, it } from 'vitest'
import { EFFECTS, hasAnimation, layerAt, type EffectLayer, type TextLayer } from './builder'
import { MAX_PARTICLES, effectCount, effectParticles } from './effects'

const effect = (patch: Partial<EffectLayer> = {}): EffectLayer => ({
  id: 'fx',
  type: 'effect',
  name: 'fx',
  effect: 'snow',
  density: 0.5,
  speed: 0.5,
  size: 1,
  wind: 0.3,
  color: '#ffffff',
  seed: 42,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  visible: true,
  animation: 'none',
  strength: 0,
  ...patch,
})

const W = 615
const H = 700

describe('effectParticles', () => {
  it('ends the loop exactly where it started', () => {
    for (const kind of EFFECTS)
      for (const loop of [1, 2, 4])
        for (const speed of [0, 0.5, 1]) {
          const layer = effect({ effect: kind, speed })
          const start = effectParticles(layer, W, H, loop, 0)
          const end = effectParticles(layer, W, H, loop, 1)
          expect(end).toHaveLength(start.length)
          start.forEach((p, i) => {
            const q = end[i]!
            expect(q.x).toBeCloseTo(p.x, 6)
            expect(q.y).toBeCloseTo(p.y, 6)
            expect(q.alpha).toBeCloseTo(p.alpha, 6)
            expect(q.flip).toBeCloseTo(p.flip, 6)
            expect(((q.angle - p.angle) % 360) + 0).toBeCloseTo(0, 6)
          })
        }
  })

  it('draws the same picture for the same seed', () => {
    expect(effectParticles(effect(), W, H, 2, 0.3)).toEqual(effectParticles(effect(), W, H, 2, 0.3))
    expect(effectParticles(effect({ seed: 7 }), W, H, 2, 0.3)).not.toEqual(effectParticles(effect(), W, H, 2, 0.3))
  })

  it('keeps existing particles when density grows', () => {
    const sparse = effectParticles(effect({ density: 0.2 }), W, H, 2, 0.3)
    const dense = effectParticles(effect({ density: 0.8 }), W, H, 2, 0.3)
    expect(dense.length).toBeGreaterThan(sparse.length)
    expect(dense.slice(0, sparse.length)).toEqual(sparse)
  })

  it('scales the count with the showcase and caps it', () => {
    expect(effectCount(effect(), W * 2, H)).toBeGreaterThan(effectCount(effect(), W, H))
    expect(effectCount(effect({ density: 1 }), 1920, 4000)).toBe(MAX_PARTICLES)
  })

  it('keeps stars in place', () => {
    const a = effectParticles(effect({ effect: 'stars' }), W, H, 2, 0)
    const b = effectParticles(effect({ effect: 'stars' }), W, H, 2, 0.37)
    expect(b.map((p) => [p.x, p.y])).toEqual(a.map((p) => [p.x, p.y]))
    expect(b.some((p, i) => Math.abs(p.alpha - a[i]!.alpha) > 0.05)).toBe(true)
  })

  it('lets rain fall and embers rise', () => {
    const share = (kind: EffectLayer['effect'], sign: number) => {
      const a = effectParticles(effect({ effect: kind, wind: 0 }), W, H, 2, 0.3)
      const b = effectParticles(effect({ effect: kind, wind: 0 }), W, H, 2, 0.305)
      return a.filter((p, i) => Math.sign(b[i]!.y - p.y) === sign).length / a.length
    }
    expect(share('rain', 1)).toBeGreaterThan(0.9)
    expect(share('snow', 1)).toBeGreaterThan(0.9)
    expect(share('embers', -1)).toBeGreaterThan(0.9)
  })

  it('keeps alpha between 0 and 1', () => {
    for (const kind of EFFECTS)
      for (const p of effectParticles(effect({ effect: kind }), W, H, 3, 0.6)) {
        expect(p.alpha).toBeGreaterThanOrEqual(0)
        expect(p.alpha).toBeLessThanOrEqual(1)
      }
  })
})

describe('effect layers', () => {
  const text: TextLayer = {
    id: 'txt',
    type: 'text',
    name: 'txt',
    text: 'hi',
    font: 'Inter',
    size: 20,
    weight: 400,
    color: '#fff',
    stroke: 0,
    strokeColor: '#000',
    glow: 0,
    x: 100,
    y: 100,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    animation: 'none',
    strength: 0,
  }

  it('makes the scene animated', () => {
    expect(hasAnimation([text])).toBe(false)
    expect(hasAnimation([text, effect()])).toBe(true)
    expect(hasAnimation([text, effect({ visible: false })])).toBe(false)
  })

  it('is not picked by the mouse', () => {
    const size = () => ({ width: 40, height: 20 })
    expect(layerAt([text, effect()], size, 100, 100)?.id).toBe('txt')
    expect(layerAt([effect()], size, 0, 0)).toBeNull()
  })
})
