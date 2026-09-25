// Прогон оформления картинок в настоящем браузере: обводка, свечение и растворение края —
// это пиксели, юнит-тестом их не проверить. Кладём в избранную иллюстрацию красный круг на
// прозрачном фоне, включаем оформление, собираем PNG и смотрим, что вышло в конкретных точках.
// Избранная режется один в один, поэтому точка на холсте — та же точка в готовом файле.
//
//   npm run build && npm run e2e:styles

import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { unzipSync } from 'fflate'
import { ROOT, gifFrames, png, readPixels, startServer } from './helpers.mjs'

const options = { out: fileURLToPath(new URL('e2e-out/styles', ROOT)), base: null, port: 4181 }
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '')
  if (key in options) options[key] = process.argv[++i]
  else throw new Error(`не знаю такой ключ: ${process.argv[i]}`)
}
options.port = Number(options.port)
mkdirSync(options.out, { recursive: true })

const failures = []
const say = (m) => console.log(m)
const check = (ok, what) => {
  if (!ok) failures.push(what)
  console.log(`  ${ok ? '✓' : '✗'} ${what}`)
}

// Круг радиусом 60 в картинке 200×200. Новый слой встаёт в центр холста избранной высотой 700
// без масштаба, так что центр круга окажется в (315, 350)
const DISC = `${options.out}/disc.png`
writeFileSync(
  DISC,
  png(200, 200, (x, y) => {
    const alpha = Math.max(0, Math.min(1, 60.5 - Math.hypot(x + 0.5 - 100, y + 0.5 - 100)))
    return [230, 20, 20, Math.round(alpha * 255)]
  }),
)
const CX = 315
const CY = 350

const server = await startServer(options)
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1300 }, acceptDownloads: true, locale: 'ru-RU' })
const page = await ctx.newPage()

const crashes = []
page.on('pageerror', (e) => crashes.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') crashes.push(m.text())
})

const shot = (name) => page.screenshot({ path: `${options.out}/${name}.png` })

async function setRange(label, value) {
  const input = page.locator(`label:has(span:text-is("${label}")) input[type=range]`)
  await input.evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, String(value))
}

// Собирает архив и отдаёт байты готовой картинки
async function exportPng(name) {
  const download = page.waitForEvent('download', { timeout: 120000 })
  await page.getByRole('button', { name: /ZIP/ }).click()
  const path = `${options.out}/${name}.zip`
  await (await download).saveAs(path)
  const files = unzipSync(new Uint8Array(readFileSync(path)))
  const bytes = files['featured.png']
  if (bytes) writeFileSync(`${options.out}/${name}.png`, bytes)
  return bytes
}

const alphaOf = (pixel) => pixel[3]

try {
  say('открываю конструктор')
  await page.goto(`${server.base}/ru/builder`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('button', { name: /^Избранная/ }).first().click()
  await page.locator('input[type=file][accept="image/*"]').setInputFiles(DISC)
  await page.locator('[data-style]').waitFor({ timeout: 30000 })
  check(true, 'у картинки появился блок оформления')

  say('обводка')
  await setRange('Обводка', 10)
  await page.waitForTimeout(400)
  await shot('01-обводка')
  const first = await exportPng('обводка')
  check(!!first, 'картинка собралась')
  const [center, ring, outside] = await readPixels(page, first, [
    [CX, CY],
    [CX + 66, CY],
    [CX, CY - 75],
  ])
  check(center[0] > 200 && center[1] < 60 && alphaOf(center) > 250, `в центре круг как был (${center})`)
  check(ring[0] > 200 && ring[1] > 200 && ring[2] > 200 && alphaOf(ring) > 200, `за краем круга белая обводка (${ring})`)
  check(alphaOf(outside) < 10, `дальше обводки пусто (${outside})`)

  say('свечение и растворение снизу')
  await setRange('Свечение', 20)
  await page.getByRole('button', { name: 'Снизу', exact: true }).click()
  await setRange('Ширина растворения', 100)
  await page.waitForTimeout(400)
  await shot('02-свечение-растворение')
  const second = await exportPng('свечение')
  const [glow, top, bottom] = await readPixels(page, second, [
    [CX, CY - 75],
    [CX, CY - 50],
    [CX, CY + 50],
  ])
  check(alphaOf(glow) > 15, `за обводкой появилось свечение (${glow})`)
  check(alphaOf(top) > 170, `верх круга почти не тронут (${top})`)
  check(alphaOf(bottom) < 90, `низ круга растворился (${bottom})`)

  // Оформление считается один раз и дальше рисуется готовым, иначе гифка на полторы сотни
  // кадров с обводкой собиралась бы в разы дольше, чем без неё
  say('та же картинка с анимацией в гифку')
  await page.getByRole('button', { name: 'Парение', exact: true }).click()
  const started = Date.now()
  const download = page.waitForEvent('download', { timeout: 300000 })
  await page.getByRole('button', { name: 'Собрать гифки' }).click()
  const gifPath = `${options.out}/анимация.zip`
  await (await download).saveAs(gifPath)
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const gif = unzipSync(new Uint8Array(readFileSync(gifPath)))['featured.gif']
  if (gif) writeFileSync(`${options.out}/анимация.gif`, gif)
  const frames = gif ? gifFrames(gif) : 0
  check(frames > 1, `гифка с оформлением собралась: ${frames} кадров за ${seconds} с`)

  // Кадры пишутся только там, где что-то поменялось, и ложатся поверх прошлых. Смотрим глазами
  // самого браузера: круг в центре на каждом кадре, а в углу пусто — если бы место кадра не
  // записалось, куски круга полезли бы в левый верхний угол
  if (gif) {
    const played = await page.evaluate(async (b64) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const decoder = new ImageDecoder({ data, type: 'image/gif' })
      await decoder.tracks.ready
      const count = decoder.tracks.selectedTrack.frameCount
      const ctx = new OffscreenCanvas(630, 700).getContext('2d')
      const out = []
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i })
        ctx.clearRect(0, 0, 630, 700)
        ctx.drawImage(image, 0, 0)
        image.close()
        const at = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data)
        out.push({ center: at(315, 350), corner: at(20, 20) })
      }
      return out
    }, Buffer.from(gif).toString('base64'))
    check(played.length === frames, `браузер видит все кадры (${played.length})`)
    // низ круга с прошлого шага растворяется, поэтому в центре он наполовину прозрачный поверх
    // чёрного — не ярко-красный, но явно красный
    check(
      played.every((f) => f.center[0] > 80 && f.center[0] > f.center[1] * 3),
      'на каждом кадре круг на своём месте',
    )
    check(
      played.every((f) => f.corner[0] < 20 && f.corner[1] < 20 && f.corner[2] < 20),
      'в углу пусто на каждом кадре: кадры встают на свои места',
    )
  }

  // Анимация по ключам: к середине цикла круг уезжает на 120 вправо и возвращается к началу
  say('анимация по ключам')
  await page.getByRole('button', { name: 'По ключам', exact: true }).click()
  await page.locator('[data-keyframes]').waitFor()
  await setRange('Момент цикла', 50)
  await setRange('Сдвиг по горизонтали', 120)
  await page.waitForTimeout(400)
  await shot('03-ключи')
  const keysDownload = page.waitForEvent('download', { timeout: 300000 })
  await page.getByRole('button', { name: 'Собрать гифки' }).click()
  const keysPath = `${options.out}/ключи.zip`
  await (await keysDownload).saveAs(keysPath)
  const keysGif = unzipSync(new Uint8Array(readFileSync(keysPath)))['featured.gif']
  if (keysGif) {
    writeFileSync(`${options.out}/ключи.gif`, keysGif)
    const moved = await page.evaluate(async (b64) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const decoder = new ImageDecoder({ data, type: 'image/gif' })
      await decoder.tracks.ready
      const count = decoder.tracks.selectedTrack.frameCount
      const ctx = new OffscreenCanvas(630, 700).getContext('2d')
      const sample = async (index) => {
        const { image } = await decoder.decode({ frameIndex: index })
        ctx.clearRect(0, 0, 630, 700)
        ctx.drawImage(image, 0, 0)
        image.close()
        return Array.from(ctx.getImageData(435, 330, 1, 1).data)
      }
      return { start: await sample(0), middle: await sample(Math.round(count / 2) - 1), count }
    }, Buffer.from(keysGif).toString('base64'))
    const reddish = (p) => p[0] > 80 && p[0] > p[1] * 3
    check(reddish(moved.middle), `к середине цикла круг уехал вправо (${moved.middle.slice(0, 3)})`)
    check(moved.start[0] < 60, `в начале цикла круг на своём месте (${moved.start.slice(0, 3)})`)
  } else {
    check(false, 'гифка с ключами собралась')
  }

  check(crashes.length === 0, `без ошибок в консоли${crashes.length ? ': ' + crashes.join(' | ') : ''}`)
} finally {
  await browser.close()
  await server.stop()
}

say(failures.length ? `\nне сошлось: ${failures.join(', ')}` : '\nвсё сошлось')
process.exit(failures.length ? 1 : 0)
