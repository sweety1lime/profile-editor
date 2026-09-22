import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogItem, CatalogKind } from './catalog'

// Каталог кэширует загруженное в самом модуле, поэтому каждый тест берёт его заново
const freshCatalog = () => import('./catalog')

const shard = (kind: string, n: number) => `${kind}-${n}.json`

const index = {
  version: 'v1',
  kinds: {
    backgrounds: { total: 3, shards: [shard('backgrounds', 0), shard('backgrounds', 1)] },
    mini: { total: 0, shards: [] },
    frames: { total: 1, shards: [shard('frames', 0)] },
    avatars: { total: 0, shards: [] },
    profiles: { total: 0, shards: [] },
  },
  colors: { backgrounds: ['colors-backgrounds-0.json'] },
}

const item = (d: number, over: Partial<CatalogItem> = {}): CatalogItem => ({
  d,
  a: 440,
  n: `фон ${d}`,
  p: 500,
  t: 1,
  i: `${d}.jpg`,
  ...over,
})

const files: Record<string, unknown> = {
  'catalog/index.json': index,
  'catalog/backgrounds-0.json': [item(1), item(2)],
  'catalog/backgrounds-1.json': [item(3)],
  'catalog/colors-backgrounds-0.json': ['aabbcc', '', 'ddeeff'],
  'catalog/apps.json': { names: { '440': 'Team Fortress 2' }, adult: [666] },
}

let requested: string[] = []
let broken = new Set<string>()

function stubFetch() {
  requested = []
  broken = new Set()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input)
      requested.push(url)
      const key = url.split('?')[0]!.replace(/^\//, '')
      const body = files[key]
      const ok = body !== undefined && !broken.has(key)
      return { ok, status: ok ? 200 : 500, json: async () => body } as Response
    }),
  )
}

const countOf = (part: string) => requested.filter((url) => url.includes(part)).length

beforeEach(() => {
  vi.resetModules()
  stubFetch()
})

afterEach(() => vi.unstubAllGlobals())

describe('каталог', () => {
  it('склеивает шарды по порядку и ходит за индексом один раз', async () => {
    const { loadKind } = await freshCatalog()

    const first = await loadKind('backgrounds')
    const second = await loadKind('backgrounds')

    expect(first.map((i) => i.d)).toEqual([1, 2, 3])
    expect(second).toBe(first)
    expect(countOf('index.json')).toBe(1)
    expect(countOf('backgrounds-')).toBe(2)
  })

  it('к упавшей загрузке возвращается заново', async () => {
    const { loadKind } = await freshCatalog()
    broken.add('catalog/backgrounds-1.json')

    await expect(loadKind('backgrounds')).rejects.toThrow()

    broken.clear()
    const list = await loadKind('backgrounds')
    expect(list.map((i) => i.d)).toEqual([1, 2, 3])
    // индекс уже был, а шарды перезапросили
    expect(countOf('index.json')).toBe(1)
    expect(countOf('backgrounds-')).toBe(4)
  })

  it('палитры идут тем же порядком, что и фоны', async () => {
    const { loadKind, loadPalettes } = await freshCatalog()

    const [items, palettes] = await Promise.all([loadKind('backgrounds'), loadPalettes('backgrounds')])

    expect(palettes).toHaveLength(items.length)
    // пустая строка — палитру посчитать не вышло, место в списке за предметом остаётся
    expect(palettes).toEqual(['aabbcc', '', 'ddeeff'])
  })

  it('игры для взрослых складывает в набор по номеру', async () => {
    const { loadApps } = await freshCatalog()

    const apps = await loadApps()

    expect(apps.names['440']).toBe('Team Fortress 2')
    expect(apps.adult.has(666)).toBe(true)
    expect(apps.adult.has(440)).toBe(false)
  })

  it('для фона берёт лёгкое превью, для рамки — саму картинку', async () => {
    const { thumbUrl } = await freshCatalog()

    expect(thumbUrl('backgrounds', item(1))).toContain('size=320x200')
    expect(thumbUrl('frames', item(1))).toContain('/items/440/1.jpg')
    expect(thumbUrl('frames', item(1))).not.toContain('size=')
  })

  it('анимированную версию находит у тех, у кого она есть', async () => {
    const { motionUrl } = await freshCatalog()

    expect(motionUrl('backgrounds', item(1, { w: 'clip.webm' }))).toContain('clip.webm')
    expect(motionUrl('backgrounds', item(1))).toBeNull()
    expect(motionUrl('frames', item(1, { s: 'small.png' }))).toContain('small.png')
    expect(motionUrl('profiles' as CatalogKind, item(1, { s: 'small.png' }))).toBeNull()
  })
})
