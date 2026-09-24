import { describe, expect, it } from 'vitest'
import { uploadReadme } from './readme'

// ключ перевода и его подстановки как есть: так видно, что записка ссылается на нужное
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)

describe('uploadReadme', () => {
  it('numbers the folders of the kit and skips other showcases', () => {
    const text = uploadReadme(t, [
      { kind: 'artwork', height: 260 },
      { kind: 'other', height: 150 },
      { kind: 'workshop', height: 122 },
    ])
    const lines = text.split('\n')
    const folders = lines.filter((line) => line.startsWith('kit.readme.folder') || line.startsWith('kit.readme.other'))
    expect(folders).toEqual([
      'kit.readme.folder {"folder":"1-artwork","kind":"cutter.kind.artwork"}',
      'kit.readme.other {"height":150}',
      'kit.readme.folder {"folder":"2-workshop","kind":"cutter.kind.workshop"}',
    ])
  })

  it('keeps a single showcase short', () => {
    const text = uploadReadme(t, [{ kind: 'featured', height: 300 }])
    expect(text.startsWith('cutter.readme')).toBe(true)
    expect(text).not.toContain('kit.readme.folder')
  })

  it('mentions the avatar only when there is one', () => {
    const entries = [{ kind: 'featured' as const, height: 300 }]
    expect(uploadReadme(t, entries)).not.toContain('kit.readme.avatar')
    expect(uploadReadme(t, entries, { avatar: true })).toContain('kit.readme.avatar')
  })
})
