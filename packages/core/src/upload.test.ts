import { describe, expect, it } from 'vitest'
import { UPLOAD_SNIPPETS } from './geometry'
import { UPLOAD_MODES } from './upload'

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
