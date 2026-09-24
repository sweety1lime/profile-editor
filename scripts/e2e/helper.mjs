// Прогон помощника загрузки: собранный юзерскрипт на макете страницы загрузки иллюстрации Steam
// с теми же полями. Проверяет, что витрина выбирается по имени файла из нашего архива, поля
// выставляются под неё, а витрину, нажатую руками, имя файла не перебивает.
//
//   npm run build && npm run e2e:helper

import { existsSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { ROOT, png } from './helpers.mjs'

const SCRIPT = new URL('apps/web/public/profile-editor.user.js', ROOT)
if (!existsSync(SCRIPT)) throw new Error('нет собранного помощника, сначала npm run build')

const failures = []
const say = (m) => console.log(m)
const check = (ok, what) => {
  if (!ok) failures.push(what)
  console.log(`  ${ok ? '✓' : '✗'} ${what}`)
}

// Поля как на странице Steam: размеры с id, тип файла, приложение и видимость
const PAGE = `<!doctype html><html lang="ru"><body>
<form>
  <input type="file" name="file">
  <input id="title" name="title">
  <input id="image_width" name="image_width" value="0">
  <input id="image_height" name="image_height" value="0">
  <input name="file_type" value="0">
  <input name="consumer_app_id" value="767">
  <input name="visibility" value="2">
</form></body></html>`

const picture = png(4, 4, () => [200, 40, 40])

const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const page = await browser.newPage()
const crashes = []
page.on('pageerror', (e) => crashes.push(e.message))

const value = (name) => page.locator(`input[name=${name}]`).inputValue()
const panel = () => page.locator('.panel').textContent()
const active = () => page.locator('.modes button.active').textContent()

async function choose(name) {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer: picture })
  // поля ставятся несколько раз с задержкой, как на настоящей странице
  await page.waitForTimeout(2800)
}

try {
  await page.setContent(PAGE)
  await page.addScriptTag({ content: readFileSync(SCRIPT, 'utf8') })
  await page.locator('.panel').waitFor()
  check(true, 'панель помощника появилась')

  say('часть скриншотов из архива')
  await choose('screenshot_1_main.png')
  check((await active()) === 'Скриншот', 'витрина выбралась по имени файла')
  check((await value('file_type')) === '5', 'тип файла — скриншот')
  check((await value('image_width')) === '1000' && (await value('image_height')) === '1', 'картинка помечена длинной')
  check((await panel()).includes('Витрина по имени файла'), 'помощник сказал, откуда взял витрину')
  check((await value('title')) === 'screenshot_1_main', 'название подставилось из имени')

  say('часть мастерской')
  await choose('workshop_2.png')
  check((await active()) === 'Мастерская', 'витрина сменилась на мастерскую')
  check((await value('consumer_app_id')) === '480', 'приложение для мастерской')
  check((await value('visibility')) === '0', 'видимость для мастерской')

  say('витрину нажали руками')
  await page.locator('.modes button', { hasText: 'Иллюстрация' }).click()
  await page.waitForTimeout(2800)
  check((await active()) === 'Иллюстрация', 'ручной выбор не перебит именем файла')
  check((await value('consumer_app_id')) === '767', 'поля мастерской вернулись как были')

  say('чужой файл')
  await choose('maomao.png')
  check((await active()) === 'Иллюстрация', 'по чужому имени витрина не меняется')

  check(crashes.length === 0, `без ошибок на странице${crashes.length ? ': ' + crashes.join(' | ') : ''}`)
} finally {
  await browser.close()
}

say(failures.length ? `\nне сошлось: ${failures.join(', ')}` : '\nвсё сошлось')
process.exit(failures.length ? 1 : 0)
