import { assetUrl, motionUrl, pointsShopUrl, thumbUrl, type CatalogItem } from './catalog'

// Что к комплекту берут из магазина очков. Свой фон профиля, рамку и анимированный аватар
// Steam загрузить не даёт, их покупают. Комплект запоминает, какие именно, показывает их вместе
// с артом и пишет в записку к архиву со ссылками

export type ShopSlot = 'backgrounds' | 'frames' | 'avatars' | 'mini'

export const SHOP_SLOTS: ShopSlot[] = ['backgrounds', 'frames', 'avatars', 'mini']

export const isShopSlot = (kind: string): kind is ShopSlot => (SHOP_SLOTS as string[]).includes(kind)

export interface ShopPick {
  id: number
  appid: number
  name: string
  points: number
  // картинка для списка, у фона — сам фон целиком, его видно на холсте под артом
  image: string
  // как вещь выглядит в профиле: у фонов видео, у рамок и аватаров анимированная картинка
  full: string
  video: boolean
}

export type ShopPicks = Partial<Record<ShopSlot, ShopPick>>

export function toPick(slot: ShopSlot, item: CatalogItem): ShopPick {
  const motion = motionUrl(slot, item)
  const wide = slot === 'backgrounds' || slot === 'mini'
  return {
    id: item.d,
    appid: item.a,
    name: item.n,
    points: item.p,
    image: wide ? assetUrl(item, item.i) : thumbUrl(slot, item),
    full: motion ?? assetUrl(item, item.i),
    video: wide && !!motion,
  }
}

export const shopUrl = (pick: ShopPick) => pointsShopUrl({ a: pick.appid })

// Каталог и комплект — разные страницы. Выбранное в каталоге лежит здесь, пока комплект его не заберёт
let pending: ShopPicks = {}

export const pendingShop = {
  put(slot: ShopSlot, pick: ShopPick) {
    pending = { ...pending, [slot]: pick }
  },
  take(): ShopPicks {
    const out = pending
    pending = {}
    return out
  },
}
