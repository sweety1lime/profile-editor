import { describe, expect, it } from 'vitest'
import { BRAILLE_BLANK, centerLines, countChars, parseBBCode, styleText, toBraille } from './text'

describe('parseBBCode', () => {
  it('builds a tree of known tags', () => {
    expect(parseBBCode('a [b]bold [i]both[/i][/b] c')).toEqual([
      { type: 'text', text: 'a ' },
      {
        type: 'tag',
        tag: 'b',
        value: undefined,
        children: [
          { type: 'text', text: 'bold ' },
          { type: 'tag', tag: 'i', value: undefined, children: [{ type: 'text', text: 'both' }] },
        ],
      },
      { type: 'text', text: ' c' },
    ])
  })

  it('reads url values and list items', () => {
    const [url] = parseBBCode('[url=https://example.com]site[/url]')
    expect(url).toMatchObject({ tag: 'url', value: 'https://example.com' })
    const [list] = parseBBCode('[list][*]one[*]two[/list]')
    expect(list).toMatchObject({ tag: 'list' })
    expect((list as { children: unknown[] }).children).toHaveLength(2)
  })

  it('keeps unknown tags and stray closings as text', () => {
    expect(parseBBCode('[img]x[/img] [/b]')).toEqual([{ type: 'text', text: '[img]x[/img] [/b]' }])
  })

  it('does not parse inside noparse', () => {
    expect(parseBBCode('[noparse][b]raw[/b][/noparse]')).toEqual([
      { type: 'tag', tag: 'noparse', value: undefined, children: [{ type: 'text', text: '[b]raw[/b]' }] },
    ])
  })

  it('closes forgotten tags when the parent closes', () => {
    const [quote] = parseBBCode('[quote][b]x[/quote]after')
    expect(quote).toMatchObject({ tag: 'quote' })
  })
})

describe('toBraille', () => {
  it('turns dark pixels into dots', () => {
    // 2×4 полностью тёмная клетка — все 8 точек
    expect(toBraille(new Array(8).fill(0), 2, 4)).toBe('⣿')
    expect(toBraille(new Array(8).fill(255), 2, 4)).toBe(BRAILLE_BLANK)
  })

  it('maps the left column to dots 1-2-3-7', () => {
    const gray = [0, 255, 0, 255, 0, 255, 0, 255]
    expect(toBraille(gray, 2, 4)).toBe('⡇')
  })

  it('can invert and handles ragged edges', () => {
    expect(toBraille([255, 255, 255], 3, 1, { invert: true })).toBe('⠉⠁')
  })

  it('keeps some dots on mid gray with dithering', () => {
    const gray = new Array(16 * 8).fill(128)
    const plain = toBraille(gray, 16, 8, { threshold: 128 })
    const dithered = toBraille(gray, 16, 8, { threshold: 128, dither: true })
    expect(plain).not.toBe(dithered)
  })
})

describe('styleText', () => {
  it('maps latin letters and digits', () => {
    expect(styleText('Ab1', 'bold')).toBe('𝐀𝐛𝟏')
    expect(styleText('Hi', 'script')).toBe('ℋ𝒾')
    expect(styleText('a b', 'fullwidth')).toBe('ａ　ｂ')
    expect(styleText('Ab', 'smallCaps')).toBe('ᴀʙ')
  })

  it('leaves cyrillic alone', () => {
    expect(styleText('Привет', 'bold')).toBe('Привет')
  })
})

describe('centerLines', () => {
  const measure = (s: string) => [...s].length * 10

  it('pads each line towards the middle', () => {
    expect(centerLines('ab\nabcd', measure, 100)).toBe(`${BRAILLE_BLANK.repeat(4)}ab\n${BRAILLE_BLANK.repeat(3)}abcd`)
  })

  it('re-centers already padded text', () => {
    const once = centerLines('ab', measure, 100)
    expect(centerLines(once, measure, 100)).toBe(once)
  })
})

describe('countChars', () => {
  it('counts symbols, not UTF-16 halves', () => {
    expect(countChars('𝐀𝐛')).toBe(2)
  })
})
