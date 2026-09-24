import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGS, type Lang } from './langs'

// Заголовок, описание и ссылки для поиска и соцсетей. Сайт одностраничный, поэтому теги
// проставляем сами при каждом переходе, иначе на всех адресах будет висеть один и тот же заголовок

const SITE = 'Profile Editor'

// адрес страницы после языка → ключ в переводах
const PAGES: Record<string, string> = {
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

const OG_LOCALE: Record<Lang, string> = { ru: 'ru_RU', en: 'en_US' }

export function pageKey(pathname: string): string {
  const page = pathname.replace(/^\/(ru|en)(\/|$)/, '').replace(/\/+$/, '')
  return PAGES[page] ?? 'notFound'
}

// Свои теги помечаем data-meta, чтобы находить и обновлять именно их
function tag<T extends HTMLElement>(selector: string, create: () => T): T {
  const found = document.head.querySelector<T>(selector)
  if (found) return found
  const el = create()
  document.head.append(el)
  return el
}

function meta(attr: 'name' | 'property', key: string, content: string) {
  tag<HTMLMetaElement>(`meta[${attr}="${key}"]`, () => {
    const el = document.createElement('meta')
    el.setAttribute(attr, key)
    return el
  }).content = content
}

function link(rel: string, href: string, hreflang?: string) {
  const id = hreflang ? `${rel}-${hreflang}` : rel
  const el = tag<HTMLLinkElement>(`link[data-meta="${id}"]`, () => {
    const created = document.createElement('link')
    created.rel = rel
    created.dataset.meta = id
    if (hreflang) created.hreflang = hreflang
    return created
  })
  el.href = href
}

export function usePageMeta(lang: Lang, pathname: string) {
  const { i18n } = useTranslation()
  // Берём перевод именно того языка, что стоит в адресе: теги описывают конкретную языковую
  // версию страницы, и при переключении языка заголовок не должен на миг разойтись с og:locale
  const t = useMemo(() => i18n.getFixedT(lang), [i18n, lang])
  const key = pageKey(pathname)

  useEffect(() => {
    const title = t(`meta.${key}.title`)
    const description = t(`meta.${key}.description`)
    const full = key === 'home' ? title : `${title} — ${SITE}`
    // у превью-деплоев Vercel свой адрес, но он закрыт от поисковиков заголовком X-Robots-Tag
    const { origin } = window.location
    const url = origin + pathname

    document.title = full
    meta('name', 'description', description)
    link('canonical', url)

    for (const other of LANGS) {
      link('alternate', origin + pathname.replace(/^\/(ru|en)/, `/${other}`), other)
    }
    link('alternate', origin + pathname.replace(/^\/(ru|en)/, '/en'), 'x-default')

    meta('property', 'og:type', 'website')
    meta('property', 'og:site_name', SITE)
    meta('property', 'og:locale', OG_LOCALE[lang])
    meta('property', 'og:title', full)
    meta('property', 'og:description', description)
    meta('property', 'og:url', url)
    meta('name', 'twitter:card', 'summary')
    meta('name', 'twitter:title', full)
    meta('name', 'twitter:description', description)
  }, [t, key, lang, pathname])
}
