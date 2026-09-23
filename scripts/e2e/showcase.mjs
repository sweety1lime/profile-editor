// Прогон конструктора в настоящем браузере: проверяет то, чего не достают юнит-тесты —
// холст, вырезку фона, кодирование гифок в воркерах и перенос готовой витрины в превью профиля.
//
//   npm run build && npm run e2e
//   npm run e2e -- --kind featured --height 780 --character art/maomao.png --cutout
//
// Скриншоты каждого шага и собранный архив складываются в --out.

import { fileURLToPath } from 'node:url'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { unzipSync } from 'fflate'

const HERE = new URL('.', import.meta.url)
const ROOT = new URL('../../', HERE)

// Steam обещает принимать файлы до 5 МБ — проверяем настоящее ограничение, а не нашу константу
const STEAM_LIMIT = 5 * 1024 * 1024
const DEFAULT_BACKGROUND =
  'https://shared.fastly.steamstatic.com/community_assets/images/items/1276790/476eef29c88cb1a62742048f6285fa5c424baa4a.jpg'

function parseArgs(argv) {
  const options = {
    kind: 'artwork',
    height: 380,
    background: DEFAULT_BACKGROUND,
    character: null,
    cutout: false,
    effect: null,
    title: null,
    subtitle: null,
    out: new URL('e2e-out/', ROOT).pathname.slice(1),
    base: null,
    port: 4173,
  }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    if (key === 'cutout') options.cutout = true
    else if (key in options) options[key] = argv[++i]
    else throw new Error(`не знаю такой ключ: ${argv[i]}`)
  }
  options.height = Number(options.height)
  options.port = Number(options.port)
  return options
}

const options = parseArgs(process.argv.slice(2))
mkdirSync(options.out, { recursive: true })

const KIND_LABELS = { artwork: 'Иллюстрации', featured: 'Избранная', screenshot: 'Скриншоты', workshop: 'Мастерская' }
const EFFECT_LABELS = { snow: 'Снег', rain: 'Дождь', sakura: 'Сакура', embers: 'Искры', stars: 'Звёзды' }
const SCENE_WIDTH = { artwork: 615, featured: 630, screenshot: 615, workshop: 612.4 }

const failures = []
const say = (m) => console.log(m)
const check = (ok, what) => {
  if (!ok) failures.push(what)
  console.log(`  ${ok ? '✓' : '✗'} ${what}`)
}

// --- сервер со собранной сборкой: в dev Vite до-оптимизирует зависимости и перезагружает страницу

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

async function startServer() {
  if (options.base) return { base: options.base, stop: async () => {} }
  if (!existsSync(new URL('apps/web/dist/index.html', ROOT))) {
    throw new Error('нет собранной сборки, сначала npm run build')
  }
  const { preview } = await import('vite')
  // configFile: false — превью только раздаёт dist, плагины сборки ему не нужны
  const server = await preview({
    root: fileURLToPath(new URL('apps/web/', ROOT)),
    configFile: false,
    preview: { host: '127.0.0.1', port: options.port, strictPort: true },
  })
  const base = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${options.port}`
  if (!(await waitFor(`${base}/`))) throw new Error('сервер не поднялся')
  return { base, stop: () => server.close() }
}

// --- разбор собранного архива

// Кадры считаем по структуре файла, а не поиском байтов: последовательность 21 F9 04
// попадается и внутри сжатых данных, и проверка начинает врать через раз
function gifFrames(data) {
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

function inspectArchive(path) {
  const files = unzipSync(new Uint8Array(readFileSync(path)))
  const parts = []
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('.txt')) continue
    writeFileSync(`${options.out}/${name}`, data)
    const part = { name, size: data.length }
    if (name.endsWith('.gif')) {
      part.width = data[6] | (data[7] << 8)
      part.height = data[8] | (data[9] << 8)
      part.frames = gifFrames(data)
    }
    parts.push(part)
  }
  return { parts, readme: 'readme.txt' in files }
}

// --- сам прогон

const server = await startServer()
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 2200, height: 1500 }, acceptDownloads: true, locale: 'ru-RU' })
const page = await ctx.newPage()

const crashes = []
page.on('pageerror', (e) => crashes.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') crashes.push(m.text())
})

const shot = (name) => page.screenshot({ path: `${options.out}/${name}.png` })

const setNative = (locator, value) =>
  locator.evaluate((el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, String(value))

const setRange = async (label, value) => {
  const input = page.locator(`label:has(span:text-is("${label}")) input[type=range]`)
  await input.waitFor({ timeout: 15000 })
  await setNative(input, value)
}

// сдвиг в пикселях витрины: экранные считаем по той же формуле, что и холст конструктора
async function dragScene(dx, dy) {
  const box = await page.locator('section canvas').boundingBox()
  const view = Math.max(
    0.05,
    Math.min((box.width - 48) / SCENE_WIDTH[options.kind], (box.height - 48) / options.height),
  )
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx * view, box.y + box.height / 2 + dy * view, { steps: 12 })
  await page.mouse.up()
}

async function addText(text, font, size, dx, dy) {
  await page.getByRole('button', { name: '+ Текст' }).click()
  await page.getByLabel('Текст').fill(text)
  await page.locator('select').selectOption(font)
  await setRange('Размер шрифта', size)
  await page.waitForTimeout(250)
  await dragScene(dx, dy)
}

try {
  const isUrl = /^https?:\/\//i.test(options.background)
  const start = isUrl
    ? `${server.base}/ru/builder?src=${encodeURIComponent(options.background)}`
    : `${server.base}/ru/builder`

  say(`открываю конструктор: витрина «${KIND_LABELS[options.kind]}», высота ${options.height}`)
  await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 60000 })
  if (!isUrl) {
    await page.locator('input[type=file][accept="image/*,video/*"]').setInputFiles(options.background)
  }
  await page.getByRole('button', { name: 'По ширине' }).waitFor({ timeout: 90000 })
  check(true, 'фон загрузился')

  await page.getByRole('button', { name: KIND_LABELS[options.kind], exact: false }).first().click()
  // кнопка есть только у фонов профиля шириной 1920: она ставит кадр туда, где витрина окажется
  const align = page.getByRole('button', { name: 'Как в профиле' })
  if (await align.isVisible()) await align.click()
  await setRange('Высота', options.height)
  await page.waitForTimeout(400)
  await shot('01-фон')

  if (options.effect) {
    say(`добавляю эффект: ${EFFECT_LABELS[options.effect]}`)
    await page.getByRole('button', { name: '+ Эффект' }).click()
    await page.locator('[data-effects] button', { hasText: EFFECT_LABELS[options.effect] }).click()
    await page.waitForTimeout(400)
    await shot('02-эффект')
  }

  if (options.character) {
    say('добавляю картинку персонажа')
    await page.locator('input[type=file][accept="image/*"]').setInputFiles(options.character)
    await page.locator('[data-cutout]').waitFor({ timeout: 20000 })
    check(true, 'картинка стала слоем')

    if (options.cutout) {
      say('убираю у неё фон (модель качается с Hugging Face, это небыстро)')
      const started = Date.now()
      await page.locator('[data-cutout] button', { hasText: 'Убрать фон' }).click()
      const done = page.locator('[data-cutout] button', { hasText: 'Вернуть как было' })
      const broke = page.locator('[data-cutout] p.text-red-400')
      await Promise.race([
        done.waitFor({ timeout: 900000 }),
        broke.waitFor({ timeout: 900000 }).then(async () => {
          throw new Error(`вырезка не удалась: ${await broke.textContent()}`)
        }),
      ])
      check(true, `фон у картинки убран за ${Math.round((Date.now() - started) / 1000)} с`)
    }
    await page.waitForTimeout(300)
    await dragScene(0, 8)
    await shot('03-персонаж')
  }

  if (options.title) await addText(options.title, 'Russo One', 58, -140, -70)
  if (options.subtitle) await addText(options.subtitle, 'Comfortaa', 20, -140, -20)
  if (options.title || options.subtitle) await shot('04-надписи')

  const animated = Boolean(options.effect)
  say(animated ? 'собираю гифки' : 'собираю картинки')
  const wait = page.waitForEvent('download', { timeout: 600000 })
  await page.getByRole('button', { name: animated ? 'Собрать гифки' : 'Скачать ZIP' }).click()
  const download = await wait
  const archive = `${options.out}/${download.suggestedFilename()}`
  await download.saveAs(archive)
  check(true, `архив собран: ${download.suggestedFilename()}`)
  await shot('05-результат')

  const { parts, readme } = inspectArchive(archive)
  check(readme, 'в архиве есть инструкция')
  for (const part of parts) {
    check(part.size <= STEAM_LIMIT, `${part.name} влезает в 5 МБ (${(part.size / 1048576).toFixed(2)} МБ)`)
  }
  const gifs = parts.filter((p) => p.frames)
  if (gifs.length > 1) {
    const counts = new Set(gifs.map((p) => p.frames))
    check(counts.size === 1, `у всех частей поровну кадров (${[...counts].join(', ')})`)
  }

  say('переношу в превью профиля')
  await page.getByRole('button', { name: 'Показать в профиле' }).click()
  await page.getByRole('button', { name: '1:1' }).waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
  const replica = page.locator('section').last().locator('div[style*="transform: scale"]').first()
  await replica.screenshot({ path: `${options.out}/06-профиль.png` })
  check(await replica.isVisible(), 'профиль отрисовался')

  check(crashes.length === 0, `консоль браузера чистая${crashes.length ? `: ${crashes[0]}` : ''}`)
} catch (err) {
  failures.push(err.message.split('\n')[0])
  await shot('99-упало')
} finally {
  await browser.close()
  await server.stop()
}

console.log()
if (failures.length) {
  console.log(`не сошлось (${failures.length}):`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`всё сошлось, скриншоты и файлы: ${options.out}`)
