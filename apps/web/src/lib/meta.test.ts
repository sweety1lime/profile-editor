import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
// настоящий i18n: заодно убеждаемся, что ключи meta.* в переводах есть
import i18n from '../i18n'
import { pageKey, usePageMeta } from './meta'
import { describePage, headHtml } from './pageMeta'

const head = () => document.head
const content = (selector: string) => head().querySelector<HTMLMetaElement>(selector)?.content
const href = (selector: string) => head().querySelector<HTMLLinkElement>(selector)?.href
const origin = () => window.location.origin

beforeEach(() => {
  head().replaceChildren()
})

describe('pageKey', () => {
  it('узнаёт страницу по адресу', () => {
    expect(pageKey('/ru')).toBe('home')
    expect(pageKey('/en')).toBe('home')
    expect(pageKey('/ru/')).toBe('home')
    expect(pageKey('/ru/cutter')).toBe('cutter')
    expect(pageKey('/en/backgrounds')).toBe('gallery')
    expect(pageKey('/ru/builder/')).toBe('builder')
    expect(pageKey('/ru/check')).toBe('check')
    expect(pageKey('/en/нет-такой')).toBe('notFound')
  })
})

describe('usePageMeta', () => {
  it('ставит заголовок и описание страницы из переводов', () => {
    renderHook(() => usePageMeta('ru', '/ru/cutter'))

    expect(document.title).toBe('Нарезка артов под витрины — Profile Editor')
    expect(content('meta[name="description"]')).toContain('витрины Steam')
    // ключ не потерялся по дороге
    expect(document.title).not.toContain('meta.')
  })

  it('на главной заголовок не задваивает название сайта', () => {
    renderHook(() => usePageMeta('ru', '/ru'))

    expect(document.title).toBe('Profile Editor — оформление профиля Steam')
  })

  it('перечисляет языковые версии страницы', () => {
    renderHook(() => usePageMeta('en', '/en/guide'))

    expect(href('link[rel="canonical"]')).toBe(`${origin()}/en/guide`)
    expect(href('link[hreflang="ru"]')).toBe(`${origin()}/ru/guide`)
    expect(href('link[hreflang="en"]')).toBe(`${origin()}/en/guide`)
    expect(href('link[hreflang="x-default"]')).toBe(`${origin()}/en/guide`)
  })

  it('заполняет теги для соцсетей', () => {
    renderHook(() => usePageMeta('ru', '/ru/preview'))

    expect(content('meta[property="og:url"]')).toBe(`${origin()}/ru/preview`)
    expect(content('meta[property="og:title"]')).toBe(document.title)
    expect(content('meta[property="og:locale"]')).toBe('ru_RU')
    expect(content('meta[property="og:image"]')).toBe(`${origin()}/og-ru.jpg`)
    expect(content('meta[name="twitter:card"]')).toBe('summary_large_image')
  })

  it('при переходе обновляет теги, а не плодит новые', () => {
    const { rerender } = renderHook(({ path }: { path: string }) => usePageMeta('ru', path), {
      initialProps: { path: '/ru/cutter' },
    })

    rerender({ path: '/ru/builder' })

    expect(head().querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(head().querySelectorAll('link[hreflang="ru"]')).toHaveLength(1)
    expect(head().querySelectorAll('meta[property="og:url"]')).toHaveLength(1)
    expect(href('link[rel="canonical"]')).toBe(`${origin()}/ru/builder`)
    expect(document.title).toContain('Конструктор витрин')
  })

  it('подхватывает теги, которые уже пришли в html страницы', () => {
    const t = i18n.getFixedT('ru')
    head().innerHTML = headHtml(describePage('ru', '/ru/cutter', origin(), (key) => t(key)))

    renderHook(() => usePageMeta('ru', '/ru/builder'))

    expect(head().querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(head().querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(head().querySelectorAll('meta[property="og:image"]')).toHaveLength(1)
    expect(href('link[rel="canonical"]')).toBe(`${origin()}/ru/builder`)
  })

  it('закрывает от поиска ненайденную страницу и открывает снова на обычной', () => {
    const { rerender } = renderHook(({ path }: { path: string }) => usePageMeta('ru', path), {
      initialProps: { path: '/ru/нет-такой' },
    })
    expect(content('meta[name="robots"]')).toBe('noindex')
    expect(head().querySelector('link[rel="canonical"]')).toBeNull()

    rerender({ path: '/ru/guide' })

    expect(head().querySelector('meta[name="robots"]')).toBeNull()
    expect(href('link[rel="canonical"]')).toBe(`${origin()}/ru/guide`)
  })
})
