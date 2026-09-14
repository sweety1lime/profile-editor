import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync, zlibSync } from 'fflate'

// После сборки: из одного content.js делаем юзерскрипт и расширение для браузеров на Chromium.
// Оба кладём в public сайта, оттуда их и ставят

const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const pkg = JSON.parse(readFileSync(here('../package.json'), 'utf8'))
const code = readFileSync(here('../dist/content.js'), 'utf8')
const PUBLIC = here('../../../apps/web/public/')
const EXTENSION = here('../dist/extension/')
const MATCH = 'https://steamcommunity.com/sharedfiles/edititem/767/3*'

const header = readFileSync(here('../src/header.txt'), 'utf8').replace('{{version}}', pkg.version)
writeFileSync(`${PUBLIC}profile-editor.user.js`, header + code)

// --- иконки: PNG рисуем сами, чтобы не тащить графическую библиотеку

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(strToU8(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function png(width, height, rgba) {
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  // 8 бит на канал, RGBA
  ihdr.set([8, 6, 0, 0, 0], 8)
  const stride = width * 4
  const raw = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// Как favicon сайта: тёмный квадрат и две полосы витрины, основная и узкая. Размеры в клетках 32×32
const SHAPES = [
  { x: 0, y: 0, w: 32, h: 32, r: 7, color: [0x13, 0x18, 0x23], alpha: 1 },
  { x: 6, y: 8, w: 13, h: 16, r: 2, color: [0x7c, 0x9c, 0xff], alpha: 1 },
  { x: 21, y: 8, w: 5, h: 16, r: 1.5, color: [0x7c, 0x9c, 0xff], alpha: 0.55 },
]

function inside(shape, px, py) {
  const qx = Math.abs(px - (shape.x + shape.w / 2)) - (shape.w / 2 - shape.r)
  const qy = Math.abs(py - (shape.y + shape.h / 2)) - (shape.h / 2 - shape.r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= shape.r
}

function icon(size) {
  // по 16 проб на пиксель, чтобы края были гладкими
  const SAMPLES = 4
  const rgba = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0]
      for (let sy = 0; sy < SAMPLES; sy++)
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = ((x + (sx + 0.5) / SAMPLES) * 32) / size
          const py = ((y + (sy + 0.5) / SAMPLES) * 32) / size
          const c = [0, 0, 0, 0]
          for (const shape of SHAPES) {
            if (!inside(shape, px, py)) continue
            const a = shape.alpha
            for (let i = 0; i < 3; i++) c[i] = shape.color[i] * a + c[i] * (1 - a)
            c[3] = a + c[3] * (1 - a)
          }
          for (let i = 0; i < 4; i++) sum[i] += c[i]
        }
      const n = SAMPLES * SAMPLES
      const alpha = sum[3] / n
      const at = (y * size + x) * 4
      if (alpha > 0) for (let i = 0; i < 3; i++) rgba[at + i] = Math.round(sum[i] / n / alpha)
      rgba[at + 3] = Math.round(alpha * 255)
    }
  return png(size, size, rgba)
}

// --- расширение

const MESSAGES = {
  en: {
    name: 'Profile Editor: Steam showcase upload',
    description: 'Fills in the codes for long artwork, screenshots, workshop and guides on the Steam upload page',
  },
  ru: {
    name: 'Profile Editor: загрузка в витрины Steam',
    description: 'Сам подставляет коды для длинных иллюстраций, скриншотов, мастерской и гайдов на странице загрузки Steam',
  },
}

const manifest = {
  manifest_version: 3,
  name: '__MSG_name__',
  description: '__MSG_description__',
  default_locale: 'en',
  version: pkg.version,
  homepage_url: 'https://github.com/sweety1lime/profile-editor',
  icons: { 16: 'icons/16.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  content_scripts: [{ matches: [MATCH], js: ['content.js'], run_at: 'document_idle' }],
}

const json = (value) => strToU8(`${JSON.stringify(value, null, 2)}\n`)
const files = {
  'manifest.json': json(manifest),
  'content.js': strToU8(code),
}
for (const [lang, text] of Object.entries(MESSAGES)) {
  files[`_locales/${lang}/messages.json`] = json({ name: { message: text.name }, description: { message: text.description } })
}
for (const size of [16, 48, 128]) files[`icons/${size}.png`] = icon(size)

// распакованная папка нужна для проверки, архив — для сайта
rmSync(EXTENSION, { recursive: true, force: true })
for (const [name, data] of Object.entries(files)) {
  mkdirSync(dirname(EXTENSION + name), { recursive: true })
  writeFileSync(EXTENSION + name, data)
}
writeFileSync(`${PUBLIC}profile-editor-extension.zip`, zipSync(files))

console.log(`userscript and extension ${pkg.version} are ready`)
