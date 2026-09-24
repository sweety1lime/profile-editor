import { describe, expect, it } from 'vitest'
import { sliceFileName } from './crop'
import { SHOWCASES, UPLOAD_SNIPPETS } from './geometry'
import { UPLOAD_MODES, kindFromFileName } from './upload'

describe('UPLOAD_MODES', () => {
  it('sets the same values as the console snippets', () => {
    for (const kind of ['artwork', 'featured', 'screenshot', 'workshop'] as const) {
      const snippet = UPLOAD_SNIPPETS[kind]
      for (const field of UPLOAD_MODES[kind].fields) {
        expect(snippet).toContain(field.selector)
        expect(snippet).toContain(`val(${field.value})`)
      }
    }
  })

  it('patches gifs only where Steam would crop them', () => {
    expect(UPLOAD_MODES.workshop.hex).toBe(true)
    expect(UPLOAD_MODES.guide.hex).toBe(true)
    expect(UPLOAD_MODES.artwork.hex).toBe(false)
  })
})

describe('kindFromFileName', () => {
  it('reads the showcase back from every part name we export', () => {
    for (const kind of ['artwork', 'screenshot', 'featured', 'workshop'] as const) {
      for (let i = 0; i < SHOWCASES[kind].slices.length; i++) {
        expect(kindFromFileName(`${sliceFileName(kind, i)}.png`)).toBe(kind)
        expect(kindFromFileName(`${sliceFileName(kind, i)}.gif`)).toBe(kind)
      }
    }
  })

  it('does not guess for someone else\'s file', () => {
    expect(kindFromFileName('maomao.png')).toBeNull()
    expect(kindFromFileName('artworks.png')).toBeNull()
    expect(kindFromFileName('1_main.png')).toBeNull()
  })
})
