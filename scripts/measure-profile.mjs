// Замер раскладки витрин на живом профиле Steam: открываем профиль в настоящем браузере
// шириной 1920 и меряем, где стоят картинки внутри блоков витрин. По этим числам сверяется
// packages/core/src/layout.ts и kit.ts — Steam время от времени меняет вёрстку, а превью и
// нарезка на эти числа опираются вслепую.
//
//   node scripts/measure-profile.mjs https://steamcommunity.com/id/<ник>
//
// Профиль нужен открытый и с витринами иллюстраций, скриншотов, мастерской или избранной.

import { chromium } from 'playwright'

const urls = process.argv.slice(2)
if (!urls.length) throw new Error('дай ссылку на профиль')

const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, locale: 'en-US' })

for (const url of urls) {
  await page.goto(url.includes('?') ? url : `${url}?l=english`, { waitUntil: 'load', timeout: 60000 })
  // картинки витрин догружаются после load, без них высоты блоков врут
  await page.waitForFunction(
    () => [...document.querySelectorAll('.profile_leftcol img')].every((img) => img.complete),
    null,
    { timeout: 30000 },
  )

  const report = await page.evaluate(() => {
    const round = (n) => Math.round(n * 10) / 10
    const leftcol = document.querySelector('.profile_leftcol')
    if (!leftcol) return { error: 'нет левой колонки: профиль закрыт или не тот адрес' }
    const col = leftcol.getBoundingClientRect()
    const background = document.querySelector('.profile_page')?.getBoundingClientRect()
    const blocks = [...leftcol.querySelectorAll('.profile_customization')].filter(
      (el) => !el.parentElement.closest('.profile_customization'),
    )

    const kindOf = (el) => {
      const title = el.querySelector('.profile_customization_header')?.textContent.trim() ?? ''
      if (/^Featured Artwork Showcase/.test(title)) return 'featured'
      if (/^Artwork Showcase/.test(title)) return 'artwork'
      if (/^Screenshot Showcase/.test(title)) return 'screenshot'
      if (el.querySelector('.myworkshop_showcase')) return 'workshop'
      return null
    }

    const firstImage = (el, kind) =>
      kind === 'workshop'
        ? el.querySelector('.workshop_showcase_multiitem img')
        : el.querySelector('.screenshot_showcase_primary img')

    return {
      column: { left: round(col.left), top: round(col.top + scrollY) },
      pageTop: background ? round(background.top + scrollY) : null,
      blocks: blocks.map((el, index) => {
        const box = el.getBoundingClientRect()
        const kind = kindOf(el)
        const next = blocks[index + 1]?.getBoundingClientRect()
        const header = el.querySelector(':scope > .profile_customization_header')
        const info = {
          index,
          kind,
          top: round(box.top + scrollY),
          height: round(box.height),
          gapToNext: next ? round(next.top - box.bottom) : null,
          headerHeight: header ? round(header.getBoundingClientRect().height) : 0,
          headerShown: header ? getComputedStyle(header).display !== 'none' : false,
        }
        const img = kind && firstImage(el, kind)
        if (!img) return info
        const r = img.getBoundingClientRect()
        info.image = {
          x: round(r.left - col.left),
          y: round(r.top - box.top),
          width: round(r.width),
          height: round(r.height),
          below: round(box.bottom - r.bottom),
        }
        if (kind === 'artwork' || kind === 'screenshot') {
          const side = el.querySelector('.screenshot_showcase_rightcol img')
          const rightcol = el.querySelector('.screenshot_showcase_rightcol')
          const primary = el.querySelector('.screenshot_showcase_primary')
          if (side) {
            const s = side.getBoundingClientRect()
            info.side = { x: round(s.left - col.left), y: round(s.top - box.top), width: round(s.width), height: round(s.height) }
          }
          if (rightcol) info.rightcolHeight = round(rightcol.getBoundingClientRect().height)
          if (primary) info.primaryHeight = round(primary.getBoundingClientRect().height)
          const name = el.querySelector('.screenshot_showcase_itemname')
          const stats = el.querySelector('.screenshot_showcase_stats')
          if (name) info.itemnameHeight = round(name.getBoundingClientRect().height)
          if (stats) info.statsHeight = round(stats.getBoundingClientRect().height)
        }
        if (kind === 'workshop') {
          const own = el.querySelector('.myworkshop_showcase_header')
          if (own) info.ownerRowHeight = round(own.getBoundingClientRect().height)
          const items = [...el.querySelectorAll('.workshop_showcase_multiitem img')].map((i) => {
            const b = i.getBoundingClientRect()
            return round(b.left - col.left)
          })
          info.workshopItemsX = items
        }
        return info
      }),
    }
  })

  console.log(`\n${url}`)
  console.log(JSON.stringify(report, null, 1))
}

await browser.close()
