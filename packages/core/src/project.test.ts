import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { ProjectFileError, packProject, unpackProject, type ProjectData } from './project'

const project = (): ProjectData => ({
  id: 'p1',
  name: 'Мой проект',
  updatedAt: 1789000000000,
  kind: 'artwork',
  height: 700,
  frame: { x: 503, y: 305, scale: 1, height: 700 },
  durationMs: 2000,
  fps: 15,
  format: 'png',
  hex: false,
  layers: [
    {
      id: 'l1',
      type: 'text',
      name: 'надпись',
      text: 'Привет',
      font: 'Russo One',
      size: 56,
      weight: 400,
      color: '#ffffff',
      stroke: 3,
      strokeColor: '#000000',
      glow: 0,
      x: 300,
      y: 350,
      scale: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      animation: 'float',
      strength: 0.6,
    },
  ],
  background: { blob: new Blob(['bg-bytes'], { type: 'image/jpeg' }), name: 'bg.jpg' },
  assets: { a1: new Blob(['png-bytes'], { type: 'image/png' }) },
  thumbnail: new Blob(['thumb'], { type: 'image/jpeg' }),
})

describe('packProject / unpackProject', () => {
  it('round-trips settings, layers and files', async () => {
    const back = unpackProject(await packProject(project()))
    expect(back).toMatchObject({ id: 'p1', name: 'Мой проект', kind: 'artwork', height: 700, fps: 15 })
    expect(back.layers).toEqual(project().layers)
    expect(back.frame).toEqual({ x: 503, y: 305, scale: 1, height: 700 })
    expect(await back.background!.blob.text()).toBe('bg-bytes')
    expect(back.background!.blob.type).toBe('image/jpeg')
    expect(back.background!.name).toBe('bg.jpg')
    expect(await back.assets.a1!.text()).toBe('png-bytes')
    expect(await back.thumbnail!.text()).toBe('thumb')
  })

  it('works without a background and thumbnail', async () => {
    const empty = { ...project(), background: null, thumbnail: null, assets: {} }
    const back = unpackProject(await packProject(empty))
    expect(back.background).toBeNull()
    expect(back.thumbnail).toBeNull()
  })

  it('rejects files that are not projects', () => {
    expect(() => unpackProject(new Uint8Array([1, 2, 3]))).toThrow(ProjectFileError)
    expect(() => unpackProject(zipSync({ 'other.txt': strToU8('hi') }))).toThrow(ProjectFileError)
    const alien = zipSync({ 'project.json': strToU8(JSON.stringify({ format: 'something-else', version: 1 })) })
    expect(() => unpackProject(alien)).toThrow(ProjectFileError)
  })

  it('reports a missing file instead of silently dropping it', async () => {
    const bytes = await packProject(project())
    const { unzipSync } = await import('fflate')
    const files = unzipSync(bytes)
    delete files['assets/a1']
    expect(() => unpackProject(zipSync(files))).toThrow(/missing/)
  })
})
