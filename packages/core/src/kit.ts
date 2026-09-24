import { clampHeight, type Frame } from './crop'
import { SHOWCASES, hasCounter, type ShowcaseKind } from './geometry'
import { PROFILE_COLUMN_X, PROFILE_FIRST_SHOWCASE_Y, PROFILE_LAYOUT, SHOWCASE_INNER } from './layout'

// Комплект: один арт, разрезанный сразу на несколько витрин так, как они стоят в профиле друг
// под другом. Всё считается в пикселях фона профиля шириной 1920 — в тех же, что и PROFILE_OFFSET,
// поэтому картинка идёт через весь профиль без стыков и швов

// Витрина, которую комплект не режет: информационная, с играми, с достижениями. В профиле она
// стоит между витринами комплекта и сдвигает всё, что ниже, поэтому её высоту надо знать
export const OTHER_SHOWCASE = 'other'

export type KitItemKind = ShowcaseKind | typeof OTHER_SHOWCASE

// Режем ли эту витрину из арта
export const isCut = (kind: KitItemKind): kind is ShowcaseKind => kind !== OTHER_SHOWCASE

export interface KitItem {
  id: string
  kind: KitItemKind
  // высота картинки витрины в пикселях профиля, у другой витрины — высота всего её блока
  height: number
  // есть ли под правой колонкой плашка «+N», см. hasCounter; не задано — есть
  counter?: boolean
}

// Сколько остаётся под картинкой до конца блока витрины. Замерено вместе с SHOWCASE_INNER.
// Если ошибиться здесь, поедет не первая витрина, а все, что стоят под ней.
// Иллюстрации, скриншоты и избранная: рамка 1 + отступ 4 + строка с названием работы 19.
// Когда у работы появляются оценки или комментарии, под названием вырастает ещё строка в 24 px,
// у свежезалитой её нет. Мастерская: отступ картинки 2 + зазор под рядом 5 + строка счётчиков 89
const BELOW_IMAGE: Record<ShowcaseKind, number> = {
  artwork: 24,
  screenshot: 24,
  featured: 24,
  workshop: 96,
}

const BLOCK_PADDING_BOTTOM = 11

// Плашка «+N» под правой колонкой: Steam её показывает, когда работ больше, чем влезло в витрину,
// то есть почти всегда. Правая колонка тогда длиннее левой: рамка 1 + отступ 11 + плашка 57 +
// отступ 11 под картинкой вместо 24 слева
const COUNTER_COLUMN_BELOW = 80

// Высота всего блока витрины на странице: шапка, отступы и сама картинка
export function showcaseBlockHeight(kind: KitItemKind, height: number, counter = true): number {
  if (!isCut(kind)) return height
  const below = counter && hasCounter(kind) ? Math.max(BELOW_IMAGE[kind], COUNTER_COLUMN_BELOW) : BELOW_IMAGE[kind]
  return SHOWCASE_INNER[kind].y + height + below + BLOCK_PADDING_BOTTOM
}

// Блок витрины на странице: и тех, что режем, и других — они тоже занимают место
export interface KitBlock {
  id: string
  kind: KitItemKind
  // верх блока на фоне профиля
  top: number
  height: number
}

export function kitBlocks(items: KitItem[]): KitBlock[] {
  let top = PROFILE_FIRST_SHOWCASE_Y
  return items.map((item) => {
    const height = showcaseBlockHeight(item.kind, item.height, item.counter ?? true)
    const block = { id: item.id, kind: item.kind, top, height }
    top += height + PROFILE_LAYOUT.showcaseGap
    return block
  })
}

export interface KitSlot extends KitItem {
  kind: ShowcaseKind
  // верх блока витрины на фоне профиля
  blockTop: number
  blockHeight: number
  // левый верхний угол первой картинки витрины на фоне профиля
  x: number
  y: number
  // ширина витрины вместе с зазорами между частями
  width: number
}

// Где окажется каждая витрина комплекта, если сложить все витрины в левую колонку в этом
// порядке. Другие витрины окон не дают, но сдвигают всё, что под ними
export function kitSlots(items: KitItem[]): KitSlot[] {
  const blocks = kitBlocks(items)
  return items.flatMap((item, index): KitSlot[] => {
    const { kind } = item
    if (!isCut(kind)) return []
    const block = blocks[index]!
    return [
      {
        ...item,
        kind,
        blockTop: block.top,
        blockHeight: block.height,
        x: PROFILE_COLUMN_X + SHOWCASE_INNER[kind].x,
        y: block.top + SHOWCASE_INNER[kind].y,
        width: SHOWCASES[kind].width,
      },
    ]
  })
}

export interface KitRect {
  x: number
  y: number
  width: number
  height: number
}

// Части витрины на фоне профиля: между ними остаются зазоры, и всё, что на них попало, разрежет
export function kitSliceRects(slot: KitSlot): KitRect[] {
  return SHOWCASES[slot.kind].slices.map((slice) => ({
    x: slot.x + slice.x,
    y: slot.y,
    width: slice.width,
    height: slot.height,
  }))
}

// Прямоугольник, который занимают все картинки комплекта вместе
export function kitSpan(slots: KitSlot[]): KitRect | null {
  const first = slots[0]
  const last = slots[slots.length - 1]
  if (!first || !last) return null
  const x = Math.min(...slots.map((slot) => slot.x))
  const right = Math.max(...slots.map((slot) => slot.x + slot.width))
  return { x, y: first.y, width: right - x, height: last.y + last.height - first.y }
}

// Какой высоты нужен фон профиля, чтобы под ним поместился весь комплект
export function kitBackgroundHeight(blocks: KitBlock[]): number {
  const last = blocks[blocks.length - 1]
  const bottom = last ? last.top + last.height : PROFILE_FIRST_SHOWCASE_Y
  return bottom + PROFILE_LAYOUT.columnsPadding
}

// Как арт лежит на фоне профиля: точка (0, 0) картинки приходится на (x, y),
// а один пиксель картинки занимает scale пикселей профиля
export interface KitPlacement {
  x: number
  y: number
  scale: number
}

export const MIN_KIT_SCALE = 0.02
export const MAX_KIT_SCALE = 20

export const clampKitScale = (scale: number) => Math.min(MAX_KIT_SCALE, Math.max(MIN_KIT_SCALE, scale))

// Рамка витрины в пикселях исходника: с ней работает та же нарезка, что и в одиночном режиме
export function kitFrame(slot: KitSlot, placement: KitPlacement): Frame {
  const scale = clampKitScale(placement.scale)
  return {
    x: (slot.x - placement.x) / scale,
    y: (slot.y - placement.y) / scale,
    scale: 1 / scale,
    height: slot.height,
  }
}

// Арт накрывает все витрины целиком и встаёт по центру
export function fitKit(imageWidth: number, imageHeight: number, slots: KitSlot[]): KitPlacement {
  const span = kitSpan(slots)
  if (!span || imageWidth <= 0 || imageHeight <= 0) return { x: 0, y: 0, scale: 1 }
  const scale = clampKitScale(Math.max(span.width / imageWidth, span.height / imageHeight))
  return {
    x: span.x + (span.width - imageWidth * scale) / 2,
    y: span.y + (span.height - imageHeight * scale) / 2,
    scale,
  }
}

// Меняет масштаб, оставляя точку профиля под курсором на месте
export function zoomKit(placement: KitPlacement, nextScale: number, center: { x: number; y: number }): KitPlacement {
  const scale = clampKitScale(nextScale)
  const k = scale / placement.scale
  return {
    scale,
    x: center.x - (center.x - placement.x) * k,
    y: center.y - (center.y - placement.y) * k,
  }
}

// Высоты, с которых удобно начинать: у мастерской части квадратные, у избранной — широкая полоса
export const DEFAULT_SHOWCASE_HEIGHT: Record<KitItemKind, number> = {
  artwork: 260,
  screenshot: 260,
  featured: 220,
  workshop: 122,
  // пустая информационная витрина с парой строк текста
  other: 150,
}

export const DEFAULT_KIT: ShowcaseKind[] = ['artwork', 'featured', 'workshop']

export const kitItem = (kind: KitItemKind, height = DEFAULT_SHOWCASE_HEIGHT[kind]): KitItem => ({
  id: crypto.randomUUID(),
  kind,
  height: clampHeight(height),
})

// Папка витрины в архиве. Номер — это порядок загрузки в Steam, снизу вверх по странице профиля
export const kitFolder = (index: number, kind: ShowcaseKind) => `${index + 1}-${kind}`
