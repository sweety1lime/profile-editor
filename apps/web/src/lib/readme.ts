import { UPLOAD_PAGE, UPLOAD_SNIPPETS, isCut, kitFolder, type KitItemKind } from '@profile-editor/core'
import { SHOP_SLOTS, shopUrl, type ShopPicks } from './kitShop'

// Записка, которая едет в архиве рядом с картинками. Для одной витрины это просто порядок
// загрузки, для комплекта — ещё и какая папка какой витриной становится

type Translate = (key: string, options?: Record<string, unknown>) => string

// Витрина по порядку на странице. У других витрин важна только высота
export interface ReadmeEntry {
  kind: KitItemKind
  height: number
}

export function uploadReadme(
  t: Translate,
  entries: ReadmeEntry[],
  options: { avatar?: boolean; shop?: ShopPicks } = {},
): string {
  const kinds = entries.map((entry) => entry.kind).filter(isCut)
  const lines: string[] = []
  if (entries.length > 1) {
    lines.push(t('kit.readme.title'), '')
    let folder = 0
    for (const { kind, height } of entries) {
      if (!isCut(kind)) lines.push(t('kit.readme.other', { height }))
      // папки в архиве появляются, только когда своих витрин больше одной
      else if (kinds.length > 1) lines.push(t('kit.readme.folder', { folder: kitFolder(folder++, kind), kind: t(`cutter.kind.${kind}`) }))
      else lines.push(t(`cutter.kind.${kind}`))
    }
    lines.push('', t('kit.readme.order'), '')
  } else {
    lines.push(t('cutter.readme', { kind: t(`cutter.kind.${kinds[0] ?? 'artwork'}`) }), '')
  }

  lines.push(t('cutter.upload.step1', { url: UPLOAD_PAGE }), t('cutter.upload.step2'), t('cutter.upload.step3'), '')
  for (const kind of new Set(kinds)) {
    if (kinds.length > 1) lines.push(`${t(`cutter.kind.${kind}`)}:`)
    lines.push(UPLOAD_SNIPPETS[kind], '')
  }

  lines.push(t('cutter.upload.note'))
  if (kinds.includes('workshop')) lines.push(t('cutter.upload.workshopNote'))
  if (options.avatar) lines.push('', t('kit.readme.avatar'))

  const picked = SHOP_SLOTS.filter((slot) => options.shop?.[slot])
  if (picked.length) {
    lines.push('', t('kit.readme.shop'))
    for (const slot of picked) {
      const pick = options.shop![slot]!
      lines.push(t('kit.readme.shopItem', { slot: t(`kit.shop.slots.${slot}`), name: pick.name, points: pick.points, url: shopUrl(pick) }))
    }
  }
  return lines.join('\n')
}
