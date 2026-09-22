// Какие фоны не пустые в середине.
//
// Фоны магазина очков рисуют с расчётом на то, что поверх ляжет колонка профиля, поэтому у
// большинства середина почти чёрная. Витрина на таком фоне выглядит заплаткой. Скрипт качает
// маленькие превью и считает яркость, цветность и оттенок ровно там, куда встанет витрина.
//
//   node scripts/catalog/centres.mjs --words forest,bamboo --limit 300
//
// Задумано как черновик фильтра для галереи: «фоны, под которые можно собрать витрину».

import { readFileSync } from 'node:fs'
import jpeg from 'jpeg-js'

const CATALOG = new URL('../../apps/web/public/catalog/', import.meta.url)
const THUMBS = 'https://community.fastly.steamstatic.com/economy/profilebackground/items/'

// куда встанет избранная иллюстрация на фоне 1920×1080, в долях от размера
const BOX = { x0: 495 / 1920, x1: 1125 / 1920, y0: 252 / 1080, y1: 852 / 1080 }

function parseArgs(argv) {
  const options = { words: '', limit: '300', minPrice: '0', hue: 'any' }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    if (key in options) options[key] = argv[++i]
    else throw new Error(`не знаю такой ключ: ${argv[i]}`)
  }
  return {
    words: options.words ? options.words.split(',').map((w) => w.trim().toLowerCase()) : [],
    limit: Number(options.limit),
    minPrice: Number(options.minPrice),
    hue: options.hue,
  }
}

const options = parseArgs(process.argv.slice(2))
const read = (name) => JSON.parse(readFileSync(new URL(name, CATALOG), 'utf8'))

const apps = read('apps.json')
const names = apps.names ?? {}
const adult = new Set(apps.adult ?? [])

const index = read('index.json')
const items = index.kinds.backgrounds.shards.flatMap((shard) => read(shard))

const candidates = items
  .filter((it) => {
    if (adult.has(it.a)) return false
    if ((it.p ?? 0) < options.minPrice) return false
    if (!options.words.length) return true
    const hay = `${it.n ?? ''} ${names[it.a] ?? ''}`.toLowerCase()
    return options.words.some((w) => hay.includes(w))
  })
  .sort((a, b) => b.t - a.t)
  .slice(0, options.limit)

console.log(`смотрю ${candidates.length} фонов из ${items.length}`)

function middle(pixels, width, height) {
  const x0 = Math.floor(BOX.x0 * width)
  const x1 = Math.ceil(BOX.x1 * width)
  const y0 = Math.floor(BOX.y0 * height)
  const y1 = Math.ceil(BOX.y1 * height)
  let lum = 0
  let sat = 0
  let green = 0
  let warm = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      lum += 0.2126 * r + 0.7152 * g + 0.0722 * b
      sat += max === 0 ? 0 : (max - min) / max
      green += g - Math.max(r, b)
      warm += r - b
      n++
    }
  }
  return { lum: lum / n, sat: (sat / n) * 100, green: green / n, warm: warm / n }
}

async function measure(item) {
  try {
    const res = await fetch(`${THUMBS}${item.a}/${item.i}?size=320x200`)
    if (!res.ok) return null
    const image = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true })
    return { ...middle(image.data, image.width, image.height), item }
  } catch {
    return null
  }
}

const queue = [...candidates]
const measured = []
await Promise.all(
  Array.from({ length: 16 }, async () => {
    while (queue.length) {
      const result = await measure(queue.shift())
      if (result) measured.push(result)
    }
  }),
)

// середина должна быть не чёрной и не выцветшей; оттенок — по вкусу
const tint = { any: () => 0, green: (r) => r.green * 2, warm: (r) => r.warm * 2 }[options.hue] ?? (() => 0)
const score = (r) => Math.min(r.lum, 150) + r.sat * 0.8 + tint(r)
measured.sort((a, b) => score(b) - score(a))

console.log(`замерено ${measured.length}, сверху те, у кого в середине есть картинка\n`)
for (const r of measured.slice(0, 25)) {
  const { item } = r
  console.log(
    String(item.d).padStart(7),
    `яркость ${r.lum.toFixed(0).padStart(3)}`,
    `цвет ${r.sat.toFixed(0).padStart(3)}%`,
    item.an ? 'аним' : '    ',
    `${item.p} очков`.padStart(11),
    `${names[item.a] ?? item.a} — ${item.n}`.slice(0, 60),
  )
}
