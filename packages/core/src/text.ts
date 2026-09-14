// Всё для текстового блока профиля: разбор BBCode, braille-арт, Unicode-стили и центровка

// Steam молча обрезает текстовый блок после 8000 символов
export const INFOBOX_LIMIT = 8000

export const countChars = (text: string) => [...text].length

// ---------- BBCode ----------

export type BBNode = { type: 'text'; text: string } | { type: 'tag'; tag: string; value?: string; children: BBNode[] }

type TagNode = Extract<BBNode, { type: 'tag' }>

const TAGS = new Set([
  'h1', 'h2', 'h3', 'b', 'i', 'u', 'strike', 'spoiler', 'noparse', 'hr', 'url',
  'list', 'olist', 'quote', 'code', 'table', 'tr', 'th', 'td',
])
// внутри этих тегов другие теги не разбираются
const RAW = new Set(['noparse', 'code'])

export function parseBBCode(input: string): BBNode[] {
  const root: TagNode = { type: 'tag', tag: 'root', children: [] }
  const stack: TagNode[] = [root]
  const top = () => stack[stack.length - 1]!

  const pushText = (text: string) => {
    if (!text) return
    const children = top().children
    const last = children[children.length - 1]
    if (last?.type === 'text') last.text += text
    else children.push({ type: 'text', text })
  }

  const re = /\[(\/?)([a-z0-9*]+)(?:=([^\]]*))?\]/gi
  let last = 0
  for (let m = re.exec(input); m; m = re.exec(input)) {
    const [raw, closing, rawName, value] = m
    const name = rawName!.toLowerCase()
    const current = top()

    if (RAW.has(current.tag) && !(closing && name === current.tag)) continue
    if (!TAGS.has(name) && name !== '*') continue

    pushText(input.slice(last, m.index))
    last = m.index + raw.length

    if (name === '*') {
      if (top().tag === 'li') stack.pop()
      if (top().tag === 'list' || top().tag === 'olist') {
        const item: TagNode = { type: 'tag', tag: 'li', children: [] }
        top().children.push(item)
        stack.push(item)
      } else {
        pushText(raw)
      }
      continue
    }

    if (name === 'hr') {
      if (!closing) top().children.push({ type: 'tag', tag: 'hr', children: [] })
      continue
    }

    if (closing) {
      const index = stack.map((node) => node.tag).lastIndexOf(name)
      if (index > 0) stack.length = index
      else pushText(raw)
      continue
    }

    const node: TagNode = { type: 'tag', tag: name, value, children: [] }
    top().children.push(node)
    stack.push(node)
  }
  pushText(input.slice(last))
  return root.children
}

// ---------- braille-арт ----------

// Каждый символ braille — это клетка 2×4 точки. Номера битов по стандарту Unicode
const DOT_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]
export const BRAILLE_BLANK = '⠀'

export interface BrailleOptions {
  threshold?: number
  invert?: boolean
  dither?: boolean
}

// gray — яркость пикселей 0..255, ширина width. Тёмные пиксели становятся точками
export function toBraille(gray: ArrayLike<number>, width: number, height: number, options: BrailleOptions = {}): string {
  const { threshold = 128, invert = false, dither = false } = options
  const values = Float32Array.from({ length: width * height }, (_, i) => {
    const v = gray[i] ?? 255
    return invert ? 255 - v : v
  })

  const dots = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const old = values[i]!
      const on = old < threshold
      dots[i] = on ? 1 : 0
      if (!dither) continue
      // Флойд–Стейнберг: ошибку округления раздаём соседям, так полутона не пропадают
      const error = old - (on ? 0 : 255)
      if (x + 1 < width) values[i + 1]! += (error * 7) / 16
      if (y + 1 < height) {
        if (x > 0) values[i + width - 1]! += (error * 3) / 16
        values[i + width]! += (error * 5) / 16
        if (x + 1 < width) values[i + width + 1]! += error / 16
      }
    }
  }

  const lines: string[] = []
  for (let cy = 0; cy < height; cy += 4) {
    let line = ''
    for (let cx = 0; cx < width; cx += 2) {
      let bits = 0
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x < width && y < height && dots[y * width + x]) bits |= DOT_BITS[dy]![dx]!
        }
      }
      line += String.fromCharCode(0x2800 + bits)
    }
    lines.push(line)
  }
  return lines.join('\n')
}

// ---------- Unicode-стили ----------

export type TextStyle =
  | 'bold'
  | 'italic'
  | 'boldItalic'
  | 'script'
  | 'fraktur'
  | 'doubleStruck'
  | 'sans'
  | 'monospace'
  | 'fullwidth'
  | 'circled'
  | 'smallCaps'

export const TEXT_STYLES: TextStyle[] = [
  'bold', 'italic', 'boldItalic', 'script', 'fraktur', 'doubleStruck', 'sans', 'monospace', 'fullwidth', 'circled', 'smallCaps',
]

// Начала блоков «математических» букв: заглавные, строчные, цифры
const MATH: Partial<Record<TextStyle, [number, number, number?]>> = {
  bold: [0x1d400, 0x1d41a, 0x1d7ce],
  italic: [0x1d434, 0x1d44e],
  boldItalic: [0x1d468, 0x1d482],
  script: [0x1d49c, 0x1d4b6],
  fraktur: [0x1d504, 0x1d51e],
  doubleStruck: [0x1d538, 0x1d552, 0x1d7d8],
  sans: [0x1d5d4, 0x1d5ee, 0x1d7ec],
  monospace: [0x1d670, 0x1d68a, 0x1d7f6],
}

// Часть букв Unicode когда-то уже завёл в других блоках, в «математических» на их месте дыры
const HOLES: Partial<Record<TextStyle, Record<string, number>>> = {
  italic: { h: 0x210e },
  script: { B: 0x212c, E: 0x2130, F: 0x2131, H: 0x210b, I: 0x2110, L: 0x2112, M: 0x2133, R: 0x211b, e: 0x212f, g: 0x210a, o: 0x2134 },
  fraktur: { C: 0x212d, H: 0x210c, I: 0x2111, R: 0x211c, Z: 0x2128 },
  doubleStruck: { C: 0x2102, H: 0x210d, N: 0x2115, P: 0x2119, Q: 0x211a, R: 0x211d, Z: 0x2124 },
}

const SMALL_CAPS = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ'

function styleChar(ch: string, style: TextStyle): string {
  const code = ch.codePointAt(0)!
  const upper = code >= 65 && code <= 90
  const lower = code >= 97 && code <= 122
  const digit = code >= 48 && code <= 57

  if (style === 'fullwidth') {
    if (code === 32) return '　'
    return code >= 0x21 && code <= 0x7e ? String.fromCodePoint(code + 0xfee0) : ch
  }
  if (style === 'circled') {
    if (upper) return String.fromCodePoint(0x24b6 + code - 65)
    if (lower) return String.fromCodePoint(0x24d0 + code - 97)
    if (code === 48) return '⓪'
    if (digit) return String.fromCodePoint(0x2460 + code - 49)
    return ch
  }
  if (style === 'smallCaps') {
    return upper || lower ? [...SMALL_CAPS][(code | 32) - 97]! : ch
  }

  const hole = HOLES[style]?.[ch]
  if (hole) return String.fromCodePoint(hole)
  const base = MATH[style]
  if (!base) return ch
  if (upper) return String.fromCodePoint(base[0] + code - 65)
  if (lower) return String.fromCodePoint(base[1] + code - 97)
  if (digit && base[2]) return String.fromCodePoint(base[2] + code - 48)
  return ch
}

// Меняются только латиница и цифры: для кириллицы таких стилей в Unicode нет
export const styleText = (text: string, style: TextStyle) => [...text].map((ch) => styleChar(ch, style)).join('')

// ---------- центровка ----------

// Сдвигаем каждую строку символами-заполнителями, чтобы она встала по центру блока.
// measure отдаёт ширину строки в пикселях шрифтом Steam, width — ширина блока
export function centerLines(text: string, measure: (line: string) => number, width: number, pad = BRAILLE_BLANK): string {
  const padWidth = measure(pad) || 1
  return text
    .split('\n')
    .map((line) => {
      const clean = line.replace(new RegExp(`^[${pad}\\s]+`), '')
      const count = Math.max(0, Math.floor((width - measure(clean)) / 2 / padWidth))
      return pad.repeat(count) + clean
    })
    .join('\n')
}
