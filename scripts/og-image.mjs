// Картинки для превью ссылок в мессенджерах и соцсетях: apps/web/public/og-ru.jpg и og-en.jpg.
// Рисуются один раз и лежат в репозитории, после правки текста перерисовать: node scripts/og-image.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = new URL('../', import.meta.url)
const read = (path, encoding) => readFileSync(new URL(path, ROOT), encoding)
const font = (file) => read(`node_modules/@fontsource-variable/inter/files/${file}`).toString('base64')
const locale = (lang) => JSON.parse(read(`apps/web/src/locales/${lang}.json`, 'utf8'))

const TEXT = {
  ru: {
    lead: 'Нарезка под витрины, гифки до 5 МБ, конструктор, каталог фонов и превью профиля.',
    note: 'Бесплатно, в браузере, без аккаунта',
  },
  en: {
    lead: 'Showcase slicing, GIFs under 5 MB, a builder, the points shop catalog and a profile preview.',
    note: 'Free, in your browser, no account',
  },
}

// Справа условный профиль: один арт идёт через витрину иллюстраций (506 + 100) и избранную под ней,
// щели между частями нарисованы поверх — видно, что картинка режется без швов
const page = (lang) => `
<style>
  @font-face { font-family: Inter; font-weight: 100 900; src: url(data:font/woff2;base64,${font('inter-latin-wght-normal.woff2')}) format('woff2'); }
  @font-face { font-family: Inter; font-weight: 100 900; unicode-range: U+0400-04FF; src: url(data:font/woff2;base64,${font('inter-cyrillic-wght-normal.woff2')}) format('woff2'); }
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; overflow: hidden; position: relative;
    font-family: Inter, sans-serif; color: #fff;
    background: radial-gradient(760px 520px at 82% 30%, rgba(124, 156, 255, 0.16), transparent 70%), #0b0e14;
  }
  .text { position: absolute; left: 72px; top: 64px; bottom: 64px; width: 560px; display: flex; flex-direction: column; }
  .label { font-size: 18px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #7c9cff; }
  h1 { margin-top: 28px; font-size: 56px; line-height: 1.08; font-weight: 650; letter-spacing: -0.02em; }
  .lead { margin-top: 26px; font-size: 24px; line-height: 1.4; color: #94a3b8; }
  .note { margin-top: auto; font-size: 20px; color: #64748b; }

  .card { position: absolute; right: 64px; top: 56px; width: 440px; height: 518px; padding: 22px;
    border-radius: 18px; background: #131823; border: 1px solid #232a38; }
  .top { display: flex; align-items: center; gap: 16px; }
  .avatar { width: 76px; height: 76px; border-radius: 4px; outline: 2px solid #7c9cff; outline-offset: 3px; background: var(--art); background-size: 396px 356px; background-position: -210px -40px; }
  .bars { flex: 1; }
  .bar { height: 14px; border-radius: 7px; background: #2b3446; }
  .level { width: 36px; height: 36px; border-radius: 50%; border: 2px solid #7c9cff; }
  .title { width: 130px; height: 10px; margin: 26px 0 12px; }

  .art { position: relative; width: 396px; height: 356px; border-radius: 3px; overflow: hidden; background: var(--art); }
  .mountain { position: absolute; left: 0; right: 0; bottom: 0; }
  .cut { position: absolute; background: #131823; }
  .size { position: absolute; font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.75);
    padding: 3px 7px; border-radius: 5px; background: rgba(11, 14, 20, 0.55); }

  :root {
    --art:
      radial-gradient(circle at 60% 36%, #ffe6a3 0 56px, rgba(255, 170, 130, 0.35) 58px, transparent 110px),
      linear-gradient(180deg, #171a4a 0%, #4a338f 38%, #c0628f 66%, #ffae86 82%, #2a1646 82.2%, #140d2e 100%);
  }
</style>
<div class="text">
  <div class="label">Profile Editor</div>
  <h1>${locale(lang).home.title}</h1>
  <p class="lead">${TEXT[lang].lead}</p>
  <p class="note">${TEXT[lang].note}</p>
</div>
<div class="card">
  <div class="top">
    <div class="avatar"></div>
    <div class="bars">
      <div class="bar" style="width: 170px"></div>
      <div class="bar" style="width: 110px; margin-top: 10px; background: #232a38"></div>
    </div>
    <div class="level"></div>
  </div>
  <div class="bar title"></div>
  <div class="art">
    <div class="mountain" style="height: 200px; background: #3a2266; clip-path: polygon(0 100%, 0 55%, 14% 30%, 26% 52%, 40% 18%, 55% 48%, 68% 26%, 84% 50%, 100% 22%, 100% 100%)"></div>
    <div class="mountain" style="height: 130px; background: #221440; clip-path: polygon(0 100%, 0 40%, 18% 70%, 33% 36%, 50% 66%, 64% 30%, 80% 62%, 100% 38%, 100% 100%)"></div>
    <div class="mountain" style="height: 64px; background: repeating-linear-gradient(90deg, transparent 0 38px, rgba(255, 120, 170, 0.22) 38px 40px), repeating-linear-gradient(180deg, transparent 0 14px, rgba(255, 120, 170, 0.22) 14px 16px), #140d2e"></div>
    <div class="cut" style="left: 326px; top: 0; width: 6px; height: 236px"></div>
    <div class="cut" style="left: 0; top: 236px; width: 396px; height: 14px"></div>
    <div class="size" style="left: 10px; top: 10px">506</div>
    <div class="size" style="left: 340px; top: 10px">100</div>
    <div class="size" style="left: 10px; top: 260px">630</div>
  </div>
</div>`

const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } })
for (const lang of ['ru', 'en']) {
  await tab.setContent(page(lang))
  await tab.evaluate(() => document.fonts.ready)
  const path = fileURLToPath(new URL(`apps/web/public/og-${lang}.jpg`, ROOT))
  await tab.screenshot({ path, type: 'jpeg', quality: 90 })
  console.log(path)
}
await browser.close()
