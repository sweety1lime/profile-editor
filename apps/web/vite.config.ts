import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleProfileRequest } from '../../packages/core/src/steam/profile.ts'
import { LANGS, type Lang } from './src/lib/langs.ts'
import { PAGES, describePage, headHtml } from './src/lib/pageMeta.ts'
import ru from './src/locales/ru.json'
import en from './src/locales/en.json'

// Адрес сайта для ссылок в тегах и карты сайта. Vercel отдаёт его сборке сам,
// на другом хостинге его задают через SITE_URL. Без адреса теги будут без абсолютных ссылок
const env = process.env
const SITE_URL = (
  env.SITE_URL ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
).replace(/\/+$/, '')

const LOCALES = { ru, en }
const translate = (lang: Lang) => (key: string) =>
  String(key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], LOCALES[lang]))

const HEAD = /<!-- head -->[\s\S]*?<!-- \/head -->/
const headBlock = (lang: Lang, pathname: string | null) =>
  `<!-- head -->\n    ${headHtml(describePage(lang, pathname, SITE_URL, translate(lang)))}\n    <!-- /head -->`

// Мессенджеры и часть поисковиков скрипты не запускают и видят только html. Поэтому кладём копию
// index.html на каждый адрес, у каждой свои заголовок, описание и картинка, плюс карта сайта.
// /ru/cutter отдаётся из ru/cutter.html: так ищут и vite preview, и Vercel с cleanUrls.
// Корневой index.html остаётся для / и незнакомых адресов, там теги главной
function staticPages(): Plugin {
  return {
    name: 'static-pages',
    transformIndexHtml: (html) => html.replace(HEAD, headBlock('ru', null)),
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const index = bundle['index.html']
        if (index?.type !== 'asset') throw new Error('в сборке нет index.html')
        const html = String(index.source)
        const paths: string[] = []
        for (const lang of LANGS) {
          for (const page of Object.keys(PAGES)) {
            // служебная страница, в поиск её не пускаем
            if (page === 'check') continue
            const path = page ? `/${lang}/${page}` : `/${lang}`
            const source = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`).replace(HEAD, headBlock(lang, path))
            this.emitFile({ type: 'asset', fileName: `${path.slice(1)}.html`, source })
            paths.push(path)
          }
        }
        const robots = ['User-agent: *', 'Allow: /', '', 'Disallow: /ru/check', 'Disallow: /en/check']
        if (SITE_URL) {
          const urls = paths.map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`)
          const sitemap = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            ...urls,
            '</urlset>',
            '',
          ]
          this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap.join('\n') })
          robots.push('', `Sitemap: ${SITE_URL}/sitemap.xml`)
        }
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') + '\n' })
      },
    },
  }
}

// На Vercel /api отвечает серверная функция, а локально отвечаем сами, чтобы не ставить vercel cli
function steamApi(): Plugin {
  return {
    name: 'steam-api',
    configureServer(server) {
      server.middlewares.use('/api/steam/profile', async (req, res) => {
        const path = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '/'
        const response = await handleProfileRequest(
          new Request(new URL(path, 'http://localhost'), { method: req.method }),
        )
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(await response.text())
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), steamApi(), staticPages()],
  // воркер вырезки фона грузит части transformers динамически, это работает только в формате ES
  worker: { format: 'es' },
  // Эти библиотеки подключаются на ходу: кодировщик гифок — при сборке, декодеры — когда открыли
  // видео или гифку. Если Vite встретит их впервые посреди работы, он перезапакует зависимости
  // и перезагрузит страницу, потеряв всё, что человек успел собрать
  optimizeDeps: { include: ['gifenc', 'gifuct-js', 'mediabunny'] },
})
