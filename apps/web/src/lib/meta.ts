import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Lang } from './langs'
import { describePage, type HeadTag } from './pageMeta'

// Сайт одностраничный: html с тегами нужного адреса приходит только при первом заходе,
// дальше при каждом переходе теги меняем сами

export { pageKey } from './pageMeta'

// Свои теги помечены data-meta: те, что пришли в html, находим и обновляем, лишние убираем
function apply(tags: HeadTag[]) {
  const current = new Set<Element>()
  for (const tag of tags) {
    let el = document.head.querySelector<HTMLElement>(`[data-meta="${tag.id}"]`)
    if (!el) {
      el = document.createElement(tag.tag)
      el.dataset.meta = tag.id
      document.head.append(el)
    }
    if (tag.tag === 'meta') {
      el.setAttribute(tag.attr, tag.key)
      el.setAttribute('content', tag.content)
    } else {
      el.setAttribute('rel', tag.rel)
      el.setAttribute('href', tag.href)
      if (tag.hreflang) el.setAttribute('hreflang', tag.hreflang)
    }
    current.add(el)
  }
  // например, noindex с ненайденной страницы
  for (const el of document.head.querySelectorAll('[data-meta]')) {
    if (!current.has(el)) el.remove()
  }
}

export function usePageMeta(lang: Lang, pathname: string) {
  const { i18n } = useTranslation()
  // Берём перевод именно того языка, что стоит в адресе: теги описывают конкретную языковую
  // версию страницы, и при переключении языка заголовок не должен на миг разойтись с og:locale
  const t = useMemo(() => i18n.getFixedT(lang), [i18n, lang])

  useEffect(() => {
    // у превью-деплоев Vercel свой адрес, но он закрыт от поисковиков заголовком X-Robots-Tag
    const head = describePage(lang, pathname, window.location.origin, (key) => t(key))
    document.title = head.title
    apply(head.tags)
  }, [t, lang, pathname])
}
