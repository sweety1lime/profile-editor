// Прогон комплекта в настоящем браузере: один арт режется сразу на все витрины профиля.
// Проверяет то, чего не достают юнит-тесты — холст со стопкой витрин, сборку архива по папкам
// и перенос всего комплекта в превью профиля.
//
//   npm run build && npm run e2e:kit
//   npm run e2e:kit -- --art art/maomao.png
//   npm run e2e:kit -- --gif
//   npm run e2e:kit -- --builder
//
// Скриншоты каждого шага и собранный архив складываются в --out.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { unzipSync } from 'fflate'
// gifenc собран как CommonJS, именованных экспортов у него нет
import gifenc from 'gifenc'
import { ROOT, gifFrames, jpegSize, png, pngSize, readPixels, startServer } from './helpers.mjs'

function parseArgs(argv) {
  const options = {
    // без своего арта рисуем свой: цвет каждой точки хранит её координаты на фоне профиля
    art: null,
    // гифка вместо картинки: комплект собирается анимированным
    gif: false,
    // тот же комплект, но собранный слоями в конструкторе
    builder: false,
    out: new URL('e2e-out/kit/', ROOT).pathname.slice(1),
    base: null,
    port: 4180,
  }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    if (key === 'gif' || key === 'builder') options[key] = true
    else if (key in options) options[key] = argv[++i]
    else throw new Error(`не знаю такой ключ: ${argv[i]}`)
  }
  options.port = Number(options.port)
  return options
}

const options = parseArgs(process.argv.slice(2))
mkdirSync(options.out, { recursive: true })

const failures = []
const say = (m) => console.log(m)
const check = (ok, what) => {
  if (!ok) failures.push(what)
  console.log(`  ${ok ? '✓' : '✗'} ${what}`)
}

// Гифка из тех же полос, только полоса света бежит по кадрам: по ней видно,
// что во всех частях комплекта анимация идёт в ногу
function makeGif(width, height, frames) {
  const { GIFEncoder, applyPalette, quantize } = gifenc
  const gif = GIFEncoder()
  for (let f = 0; f < frames; f++) {
    const data = new Uint8Array(width * height * 4)
    const band = (f / frames) * width
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4
        const lit = Math.abs(x - band) < width / 8
        const grid = x % 100 < 2 || y % 100 < 2
        data[p] = grid ? 255 : Math.round((x / width) * 255)
        data[p + 1] = grid ? 255 : Math.round((y / height) * 255)
        data[p + 2] = lit ? 255 : 60
        data[p + 3] = 255
      }
    }
    const palette = quantize(data, 64)
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: 100 })
  }
  gif.finish()
  return Buffer.from(gif.bytes())
}

// Цвет точки хранит её координаты: младшие байты x и y в красном и зелёном, старшие — в синем.
// Тогда по любому пикселю готовой части видно, из какого места фона её вырезали
const encode = (x, y) => [x & 255, y & 255, ((x >> 8) << 4) | (y >> 8)]
const decode = ([r, g, b]) => ({ x: (b >> 4) * 256 + r, y: (b & 15) * 256 + g })

function makeArt() {
  if (options.art) return options.art
  if (options.gif) {
    const path = `${options.out}/art.gif`
    writeFileSync(path, makeGif(960, 700, 12))
    return path
  }
  const path = `${options.out}/art.png`
  writeFileSync(path, png(1920, 1400, encode))
  return path
}

// Каждая витрина в своей папке, номер папки — порядок на странице профиля.
// Размеры частей те же, что в одиночной нарезке, у мастерской файлы крупнее страницы
function checkStills(files, heights) {
  const expected = {
    '1-artwork/1_main.png': [506, heights.artwork],
    '1-artwork/2_side.png': [100, heights.artwork],
    '2-featured/featured.png': [630, heights.featured],
    '3-workshop/workshop_1.png': [150, 150],
    '3-workshop/workshop_5.png': [150, 150],
  }
  for (const [name, [width, height]] of Object.entries(expected)) {
    const size = pngSize(files[name])
    check(size?.[0] === width && size?.[1] === height, `${name} — ${width}×${height}${size ? '' : ' (нет файла)'}`)
    if (size && (size[0] !== width || size[1] !== height)) say(`    получили ${size[0]}×${size[1]}`)
  }
  check('readme.txt' in files, 'в архиве есть readme с порядком загрузки')
  const readme = Buffer.from(files['readme.txt'] ?? []).toString('utf8')
  check(readme.includes('150 px'), 'записка напоминает про другую витрину и её высоту')
}

// Главное обещание комплекта: каждая часть в превью встаёт ровно на то место фона, откуда её
// вырезали. Откуда вырезали — читаем из цвета левого верхнего пикселя готового файла, куда
// встала — меряем в превью. Мастерская растянута до 150 px, её сверяем с допуском пошире
async function checkAlignment(files) {
  const parts = {
    artwork: ['1-artwork/1_main.png', '1-artwork/2_side.png'],
    featured: ['2-featured/featured.png'],
    workshop: [1, 2, 3, 4, 5].map((n) => `3-workshop/workshop_${n}.png`),
  }
  const placed = await page.evaluate(() => {
    const background = document.querySelector('[data-replica-background]').getBoundingClientRect()
    const scale = document.querySelector('[data-replica]').getBoundingClientRect().width / 1920
    return [...document.querySelectorAll('[data-replica] [data-showcase]')].map((block) => ({
      kind: block.dataset.showcase,
      images: [...block.querySelectorAll('img')].map((img) => {
        const box = img.getBoundingClientRect()
        // рамка у картинки снаружи, сама картинка начинается за ней
        const border = parseFloat(getComputedStyle(img).borderLeftWidth) || 0
        return { x: (box.left - background.left) / scale + border, y: (box.top - background.top) / scale + border }
      }),
    }))
  })
  for (const block of placed) {
    const names = parts[block.kind] ?? []
    for (const [i, name] of names.entries()) {
      const [pixel] = await readPixels(page, files[name], [[0, 0]])
      const from = decode(pixel)
      const at = block.images[i]
      const tolerance = block.kind === 'workshop' ? 2 : 1
      const ok = at && Math.abs(at.x - from.x) <= tolerance && Math.abs(at.y - from.y) <= tolerance
      const where = at ? `(${at.x.toFixed(1)}, ${at.y.toFixed(1)})` : 'нет картинки'
      check(ok, `${name}: вырезана из (${from.x}, ${from.y}), в превью стоит в ${where}`)
    }
  }
}

// --- сам прогон

const art = makeArt()
const server = await startServer(options)
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 2000, height: 1400 }, acceptDownloads: true, locale: 'ru-RU' })
const page = await ctx.newPage()

const crashes = []
page.on('pageerror', (e) => crashes.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') crashes.push(m.text())
})

const shot = (name) => page.screenshot({ path: `${options.out}/${name}.png` })

// Другая витрина между иллюстрациями и избранной: она сдвигает всё ниже, и нарезка с превью
// должны это учесть одинаково
async function insertOther() {
  say('вставляю другую витрину между иллюстрациями и избранной')
  const rows = page.locator('[data-showcases] li')
  await page.getByRole('button', { name: '+ Другая витрина' }).click()
  await rows.last().getByRole('button', { name: 'Выше' }).click()
  await rows.nth(2).getByRole('button', { name: 'Выше' }).click()
  check((await rows.nth(1).textContent()).includes('Другая витрина'), 'другая витрина встала второй')
}

// Рамку берём из каталога: комплект уходит на другую страницу и должен вернуться целиком
async function pickFrame() {
  say('беру рамку из каталога')
  await page.locator('[data-shop="frames"]').getByRole('button', { name: 'Выбрать в каталоге' }).click()
  await page.waitForURL(/\/backgrounds\?/, { timeout: 30000 })
  const first = page.locator('[data-catalog-item]').first()
  await first.waitFor({ timeout: 60000 })
  const name = (await first.locator('.truncate').first().textContent()).trim()
  await first.click()
  await page.getByRole('button', { name: 'В комплект' }).click()
  await page.waitForURL(/\/kit$/, { timeout: 30000 })
  await page.locator('[data-kit-canvas]').waitFor({ timeout: 60000 })
  await page.waitForTimeout(600)
  check((await page.locator('[data-shop="frames"]').textContent()).includes(name), `рамка «${name}» встала в комплект`)
  check((await page.locator('[data-showcases] li').count()) === 4, 'комплект вернулся из каталога целиком')
}

const setRange = (locator, value) =>
  locator.evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, String(value))

// Высоты витрин, с которыми страница открывается: по ним считаем размеры готовых файлов
const heights = { artwork: 260, featured: 220, workshop: 119 }

try {
  if (options.builder) {
    say('открываю конструктор')
    await page.goto(`${server.base}/ru/builder`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('input[type=file][accept="image/*,video/*"]').setInputFiles(art)
    await page.getByRole('button', { name: 'По ширине' }).waitFor({ timeout: 90000 })
    check(true, 'фон загрузился')

    await page.getByRole('button', { name: 'Весь профиль' }).click()
    await page.waitForTimeout(600)
    const rows = page.locator('[data-showcases] li')
    check((await rows.count()) === 3, 'холст стал комплектом из трёх витрин')
    await insertOther()
    await shot('01-конструктор')

    say('кладу надпись на холст во весь профиль')
    await page.getByRole('button', { name: '+ Текст' }).click()
    await page.waitForTimeout(400)
    check(await page.getByLabel('Текст').isVisible(), 'слой добавился на общий холст')
    await shot('02-слой')
  } else {
    say('открываю комплект')
    await page.goto(`${server.base}/ru/kit`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    check(await page.getByRole('heading', { name: 'Комплект на весь профиль' }).isVisible(), 'страница открылась')

    await page.locator('input[type=file][accept="image/*,video/*"]').setInputFiles(art)
    await page.locator('[data-kit-canvas]').waitFor({ timeout: 60000 })
    await page.waitForTimeout(600)
    await shot('01-комплект')
    check(true, 'арт лёг на страницу профиля')

    const rows = page.locator('[data-showcases] li')
    check((await rows.count()) === 3, 'в комплекте три витрины по умолчанию')

    say('меняю высоту средней витрины')
    const before = await page.locator('[data-kit-canvas]').screenshot()
    await setRange(rows.nth(1).locator('input[type=range]'), 320)
    await page.waitForTimeout(500)
    const after = await page.locator('[data-kit-canvas]').screenshot()
    check(!before.equals(after), 'высота витрины двигает всю стопку')
    heights.featured = 320
    await insertOther()
    if (!options.gif) await pickFrame()
    await shot('02-высота')
  }

  say('собираю архив')
  const download = page.waitForEvent('download', { timeout: 300000 })
  await page.getByRole('button', { name: options.gif ? 'Собрать комплект из гифок' : 'Собрать комплект' }).click()
  // в конструкторе архив зовётся так же, как и на странице комплекта
  const zipPath = `${options.out}/kit.zip`
  await (await download).saveAs(zipPath)
  check(true, 'архив скачался')

  const files = unzipSync(new Uint8Array(readFileSync(zipPath)))
  for (const [name, data] of Object.entries(files)) {
    if (name.includes('/')) mkdirSync(`${options.out}/${name.split('/')[0]}`, { recursive: true })
    writeFileSync(`${options.out}/${name}`, data)
  }
  say(`  в архиве: ${Object.keys(files).sort().join(', ')}`)

  if (options.gif) {
    // Части комплекта живут в разных файлах, но крутиться должны в ногу: у всех одна сетка кадров
    const gifs = Object.entries(files).filter(([name]) => name.endsWith('.gif'))
    check(gifs.length === 8, `все части собрались гифками (${gifs.length})`)
    const counts = new Set(gifs.map(([, data]) => gifFrames(data)))
    check(counts.size === 1, `во всех частях поровну кадров (${[...counts].join(', ')})`)
    const heavy = gifs.filter(([, data]) => data.length > 5 * 1024 * 1024)
    check(heavy.length === 0, `все гифки уложились в 5 МБ${heavy.length ? ': ' + heavy.map(([n]) => n).join(', ') : ''}`)
    check('readme.txt' in files, 'в архиве есть readme с порядком загрузки')
  } else {
    checkStills(files, heights)
  }

  // Аватар кладёт в комплект только страница комплекта: у конструктора холст — одна левая колонка
  if (!options.builder) {
    const face = files['avatar.jpg']
    const size = jpegSize(face)
    check(size?.[0] === 184 && size?.[1] === 184, `в архиве аватар 184×184${size ? '' : ' (нет файла)'}`)
    // Свой арт 1920×1400: квадрат по умолчанию — 630 px с углом в (645, 168), так что в центре
    // аватара окажется точка арта около (962, 485). JPEG цвет чуть плавит, поэтому сверяем с допуском
    if (face && !options.art && !options.gif) {
      const [middle] = await readPixels(page, face, [[92, 92]], 'image/jpeg')
      const expected = encode(962, 485)
      const close = middle.slice(0, 3).every((value, i) => Math.abs(value - expected[i]) < 12)
      check(close, `аватар вырезан из нужного места арта (${middle.slice(0, 3)} против ${expected})`)
    }
  }

  say('переношу комплект в превью')
  await page.getByRole('button', { name: 'Примерить комплект в превью' }).click()
  await page.waitForURL(/\/preview/, { timeout: 30000 })
  await page.waitForTimeout(1500)
  await shot('03-превью')
  const shown = await page.locator('[data-replica] img').count()
  check(shown >= 8, `в превью встали все части комплекта (${shown})`)
  if (!options.builder) {
    check(await page.locator('[data-replica] img[data-avatar]').isVisible(), 'в шапке профиля стоит аватар из комплекта')
  }
  if (!options.builder && !options.gif) {
    check(await page.locator('[data-replica] img[data-frame]').isVisible(), 'на аватаре рамка из комплекта')
    const readme = Buffer.from(files['readme.txt'] ?? []).toString('utf8')
    check(readme.includes('Рамка аватара') && readme.includes('store.steampowered.com/points/shop/app/'), 'в записке рамка со ссылкой в магазин')
  }
  if (!options.art && !options.gif) await checkAlignment(files)

  check(crashes.length === 0, `без ошибок в консоли${crashes.length ? ': ' + crashes.join(' | ') : ''}`)
} finally {
  await browser.close()
  await server.stop()
}

say(failures.length ? `\nне сошлось: ${failures.join(', ')}` : '\nвсё сошлось')
process.exit(failures.length ? 1 : 0)
