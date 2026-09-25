import { describe, expect, it } from 'vitest'
import { describePage, headHtml, type HeadTag } from './pageMeta'

// переводы не нужны: вместо текста возвращаем сам ключ
const t = (key: string) => key
const find = (tags: HeadTag[], id: string) => tags.find((tag) => tag.id === id)

describe('describePage', () => {
  it('без адреса сайта не ставит абсолютных ссылок', () => {
    const { tags } = describePage('ru', '/ru/cutter', '', t)

    expect(find(tags, 'canonical')).toBeUndefined()
    expect(find(tags, 'og:url')).toBeUndefined()
    expect(find(tags, 'og:image')).toBeUndefined()
    expect(find(tags, 'twitter:card')).toMatchObject({ content: 'summary' })
    expect(find(tags, 'description')).toMatchObject({ content: 'meta.cutter.description' })
  })

  it('у html без своего адреса теги главной, но без ссылки на себя', () => {
    const { title, tags } = describePage('en', null, 'https://site.test', t)

    expect(title).toBe('meta.home.title')
    expect(find(tags, 'canonical')).toBeUndefined()
    expect(find(tags, 'og:image')).toMatchObject({ content: 'https://site.test/og-en.jpg' })
  })

  it('слеш на конце адреса в ссылки не попадает', () => {
    const { tags } = describePage('ru', '/ru/guide/', 'https://site.test', t)

    expect(find(tags, 'canonical')).toMatchObject({ href: 'https://site.test/ru/guide' })
    expect(find(tags, 'alternate-en')).toMatchObject({ href: 'https://site.test/en/guide' })
  })
})

describe('headHtml', () => {
  it('экранирует текст и помечает теги для страницы', () => {
    const html = headHtml({
      title: 'A & B',
      tags: [{ id: 'description', tag: 'meta', attr: 'name', key: 'description', content: 'say "hi" <b>' }],
    })

    expect(html).toContain('<title>A &amp; B</title>')
    expect(html).toContain('content="say &quot;hi&quot; &lt;b&gt;" data-meta="description"')
  })
})
