import { LANGS, type Lang } from './langs'

// Заголовок, описание и ссылки для поиска и соцсетей. Здесь только сами теги, без React:
// ими пользуются и страница при переходах (meta.ts), и сборка, которая кладёт готовые теги
// прямо в html каждого адреса (vite.config.ts) — мессенджеры и часть поисковиков скрипты не запускают

export const SITE = 'Profile Editor'

// адрес страницы после языка → ключ в переводах
export const PAGES: Record<string, string> = {
  '': 'home',
  cutter: 'cutter',
  kit: 'kit',
  builder: 'builder',
  preview: 'preview',
  backgrounds: 'gallery',
  infobox: 'infobox',
  guide: 'guide',
  check: 'check',
}

// картинка для превью ссылки, у каждого языка своя; рисует scripts/og-image.mjs
export const OG_IMAGE = { width: 1200, height: 630 }
export const ogImagePath = (lang: Lang) => `/og-${lang}.jpg`

const OG_LOCALE: Record<Lang, string> = { ru: 'ru_RU', en: 'en_US' }

export type HeadTag =
  | { id: string; tag: 'meta'; attr: 'name' | 'property'; key: string; content: string }
  | { id: string; tag: 'link'; rel: string; href: string; hreflang?: string }

export interface PageHead {
  title: string
  tags: HeadTag[]
}

export function pageKey(pathname: string): string {
  const page = pathname.replace(/^\/(ru|en)(\/|$)/, '').replace(/\/+$/, '')
  return PAGES[page] ?? 'notFound'
}

// origin пустой, когда адрес сайта неизвестен (сборка без SITE_URL) — тогда без абсолютных ссылок.
// pathname null — у html нет своего адреса: корневой index.html отдаётся на / и на всё незнакомое
export function describePage(
  lang: Lang,
  pathname: string | null,
  origin: string,
  t: (key: string) => string,
): PageHead {
  const key = pathname === null ? 'home' : pageKey(pathname)
  const title = t(`meta.${key}.title`)
  const description = t(`meta.${key}.description`)
  const full = key === 'home' ? title : `${title} — ${SITE}`
  const image = origin && origin + ogImagePath(lang)

  const tags: HeadTag[] = []
  const meta = (attr: 'name' | 'property', name: string, content: string) =>
    tags.push({ id: name, tag: 'meta', attr, key: name, content })
  const link = (rel: string, href: string, hreflang?: string) =>
    tags.push({ id: hreflang ? `${rel}-${hreflang}` : rel, tag: 'link', rel, href, ...(hreflang && { hreflang }) })

  meta('name', 'description', description)
  if (key === 'notFound') meta('name', 'robots', 'noindex')

  // /ru/cutter и /ru/cutter/ — одна страница, в ссылках всегда без слеша на конце
  const path = pathname?.replace(/(.)\/+$/, '$1')
  if (origin && path && key !== 'notFound') {
    link('canonical', origin + path)
    for (const other of LANGS) link('alternate', origin + path.replace(/^\/(ru|en)/, `/${other}`), other)
    link('alternate', origin + path.replace(/^\/(ru|en)/, '/en'), 'x-default')
    meta('property', 'og:url', origin + path)
  }

  meta('property', 'og:type', 'website')
  meta('property', 'og:site_name', SITE)
  meta('property', 'og:locale', OG_LOCALE[lang])
  meta('property', 'og:title', full)
  meta('property', 'og:description', description)
  if (image) {
    meta('property', 'og:image', image)
    meta('property', 'og:image:width', String(OG_IMAGE.width))
    meta('property', 'og:image:height', String(OG_IMAGE.height))
  }
  meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary')
  meta('name', 'twitter:title', full)
  meta('name', 'twitter:description', description)

  return { title: full, tags }
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// те же теги строкой для html; data-meta нужен, чтобы страница потом нашла их и обновила, а не задвоила
export function headHtml({ title, tags }: PageHead, indent = '    '): string {
  const lines = [`<title>${escape(title)}</title>`]
  for (const tag of tags) {
    lines.push(
      tag.tag === 'meta'
        ? `<meta ${tag.attr}="${tag.key}" content="${escape(tag.content)}" data-meta="${tag.id}" />`
        : `<link rel="${tag.rel}" href="${escape(tag.href)}"${tag.hreflang ? ` hreflang="${tag.hreflang}"` : ''} data-meta="${tag.id}" />`,
    )
  }
  return lines.join(`\n${indent}`)
}
