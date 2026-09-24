// Общее для прогонов в браузере: сервер со сборкой и картинки, которые рисуем сами,
// чтобы прогон не зависел ни от сети, ни от чужих файлов

import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

export const ROOT = new URL('../../', import.meta.url)

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// PNG из функции пикселя: pixel(x, y) → [r, g, b] или [r, g, b, a]
export function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  let p = 0
  for (let y = 0; y < height; y++) {
    // фильтр строки: 0 — пишем пиксели как есть
    raw[p++] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = pixel(x, y)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
      raw[p++] = a
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  // 8 бит на канал, тип 6 — RGBA
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Кадры считаем по структуре файла, а не поиском байтов: последовательность 21 F9 04
// попадается и внутри сжатых данных, и проверка начинает врать через раз
export function gifFrames(data) {
  let i = 6 + 7
  if (data[10] & 0x80) i += 3 * (1 << ((data[10] & 7) + 1))
  const skipBlocks = () => {
    while (data[i]) i += data[i] + 1
    i++
  }
  let frames = 0
  while (i < data.length) {
    const block = data[i++]
    if (block === 0x3b) break
    if (block === 0x21) {
      i++
      skipBlocks()
    } else if (block === 0x2c) {
      frames++
      const packed = data[i + 8]
      i += 9
      if (packed & 0x80) i += 3 * (1 << ((packed & 7) + 1))
      i++
      skipBlocks()
    } else break
  }
  return frames
}

// Размер PNG читаем прямо из заголовка: распаковывать картинку ради двух чисел незачем
export function pngSize(data) {
  if (!data) return null
  const read = (at) => (data[at] << 24) | (data[at + 1] << 16) | (data[at + 2] << 8) | data[at + 3]
  return [read(16), read(20)]
}

async function waitFor(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // ещё не поднялся
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// Сервер со собранной сборкой: в dev Vite до-оптимизирует зависимости и перезагружает страницу
export async function startServer({ base, port }) {
  if (base) return { base, stop: async () => {} }
  if (!existsSync(new URL('apps/web/dist/index.html', ROOT))) {
    throw new Error('нет собранной сборки, сначала npm run build')
  }
  const { preview } = await import('vite')
  const server = await preview({
    root: fileURLToPath(new URL('apps/web/', ROOT)),
    configFile: false,
    preview: { host: '127.0.0.1', port, strictPort: true },
  })
  const url = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${port}`
  if (!(await waitFor(`${url}/`))) throw new Error('сервер не поднялся')
  return { base: url, stop: () => server.close() }
}

// Пиксели готовой картинки читаем самим браузером: так не нужен свой разборщик PNG
export function readPixels(page, bytes, points, type = 'image/png') {
  return page.evaluate(
    async ({ b64, points, type }) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([data], { type }))
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')
      ctx.drawImage(bitmap, 0, 0)
      return points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data))
    },
    { b64: Buffer.from(bytes).toString('base64'), points, type },
  )
}
