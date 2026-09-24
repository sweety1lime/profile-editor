// Каталог магазина очков лежит статикой в /catalog, его раз в сутки обновляет GitHub Actions

export type CatalogKind = 'backgrounds' | 'mini' | 'frames' | 'avatars' | 'profiles'

// Короткие ключи, см. scripts/catalog/build.mjs
export interface CatalogItem {
  d: number
  a: number
  n: string
  p: number
  t: number
  i: string
  s?: string
  w?: string
  m?: string
  an?: 1
  th?: string
}

interface CatalogIndex {
  version: string
  kinds: Record<CatalogKind, { total: number; shards: string[] }>
  // палитры лежат в том же порядке, что и предметы
  colors?: Partial<Record<CatalogKind, string[]>>
}

const ASSETS = 'https://shared.fastly.steamstatic.com/community_assets/images/items/'
const THUMBS = 'https://community.fastly.steamstatic.com/economy/profilebackground/items/'

export interface CatalogApps {
  names: Record<string, string>
  // игры для взрослых, их предметы по умолчанию скрыты
  adult: Set<number>
}

let indexPromise: Promise<CatalogIndex> | null = null
let appsPromise: Promise<CatalogApps> | null = null
const kinds = new Map<CatalogKind, Promise<CatalogItem[]>>()
const palettes = new Map<CatalogKind, Promise<string[]>>()

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json() as Promise<T>
}

// Если загрузка упала, промис забываем, чтобы следующая попытка пошла заново
function loadIndex(): Promise<CatalogIndex> {
  indexPromise ??= getJson<CatalogIndex>('/catalog/index.json').catch((err) => {
    indexPromise = null
    throw err
  })
  return indexPromise
}

export function loadKind(kind: CatalogKind): Promise<CatalogItem[]> {
  let promise = kinds.get(kind)
  if (!promise) {
    promise = loadIndex()
      .then(async (index) => {
        const parts = await Promise.all(
          index.kinds[kind].shards.map((file) => getJson<CatalogItem[]>(`/catalog/${file}?v=${index.version}`)),
        )
        return parts.flat()
      })
      .catch((err) => {
        kinds.delete(kind)
        throw err
      })
    kinds.set(kind, promise)
  }
  return promise
}

// Палитры в том же порядке, что и предметы из loadKind, пустая строка — палитру посчитать не вышло
export function loadPalettes(kind: CatalogKind): Promise<string[]> {
  let promise = palettes.get(kind)
  if (!promise) {
    promise = loadIndex()
      .then(async (index) => {
        const shards = index.colors?.[kind]
        if (!shards) throw new Error(`no palettes for ${kind}`)
        const parts = await Promise.all(shards.map((file) => getJson<string[]>(`/catalog/${file}?v=${index.version}`)))
        return parts.flat()
      })
      .catch((err) => {
        palettes.delete(kind)
        throw err
      })
    palettes.set(kind, promise)
  }
  return promise
}

export function loadApps(): Promise<CatalogApps> {
  appsPromise ??= loadIndex()
    .then((index) => getJson<{ names?: Record<string, string>; adult?: number[] }>(`/catalog/apps.json?v=${index.version}`))
    .then((raw) => ({ names: raw.names ?? {}, adult: new Set(raw.adult ?? []) }))
    .catch((err) => {
      appsPromise = null
      throw err
    })
  return appsPromise
}

export const assetUrl = (item: CatalogItem, file: string) => `${ASSETS}${item.a}/${file}`

// Для фонов берём уменьшенное превью с CDN Steam: 17 КБ вместо 300
export function thumbUrl(kind: CatalogKind, item: CatalogItem): string {
  if (kind === 'backgrounds' || kind === 'mini') return `${THUMBS}${item.a}/${item.i}?size=320x200`
  if (kind === 'profiles') return assetUrl(item, item.s ?? item.i)
  return assetUrl(item, item.i)
}

// Анимированная версия: у фонов видео, у рамок и аватаров маленькая картинка
export function motionUrl(kind: CatalogKind, item: CatalogItem): string | null {
  if (kind === 'backgrounds' || kind === 'mini') {
    const file = item.w ?? item.m
    return file ? assetUrl(item, file) : null
  }
  if ((kind === 'frames' || kind === 'avatars') && item.s) return assetUrl(item, item.s)
  return null
}

export const pointsShopUrl = (item: Pick<CatalogItem, 'a'>) => `https://store.steampowered.com/points/shop/app/${item.a}`
