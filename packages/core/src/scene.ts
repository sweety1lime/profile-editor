import { clampHeight, isProfileBackground, type Frame } from './crop'
import { SHOWCASES, sliceGaps, type ShowcaseKind } from './geometry'
import { PROFILE_COLUMN_X, PROFILE_FIRST_SHOWCASE_Y, PROFILE_LAYOUT, PROFILE_OFFSET } from './layout'
import { kitSlots, type KitItem } from './kit'

// Холст, на котором собирают картинку: либо одна витрина, либо вся левая колонка профиля сразу.
// Окна витрин лежат на холсте там же, где они стоят на странице, поэтому и одиночная витрина,
// и комплект режутся одним и тем же кодом — разница только в числе окон

export interface SceneSlot {
  id: string
  kind: ShowcaseKind
  // левый верхний угол первой части витрины на холсте
  x: number
  y: number
  height: number
}

export interface SceneBox {
  width: number
  height: number
  // где угол холста оказывается на фоне профиля шириной 1920
  origin: { x: number; y: number }
  slots: SceneSlot[]
}

export function showcaseBox(kind: ShowcaseKind, height: number): SceneBox {
  return {
    width: Math.ceil(SHOWCASES[kind].width),
    height,
    origin: PROFILE_OFFSET[kind],
    slots: [{ id: kind, kind, x: 0, y: 0, height }],
  }
}

// Холст на весь профиль: левая колонка от первой витрины до низа последней
export function kitBox(items: KitItem[]): SceneBox {
  const slots = kitSlots(items)
  const last = slots[slots.length - 1]
  return {
    width: PROFILE_LAYOUT.leftWidth,
    height: Math.max(1, last ? last.blockTop + last.blockHeight - PROFILE_FIRST_SHOWCASE_Y : 1),
    origin: { x: PROFILE_COLUMN_X, y: PROFILE_FIRST_SHOWCASE_Y },
    slots: slots.map((slot) => ({
      id: slot.id,
      kind: slot.kind,
      x: slot.x - PROFILE_COLUMN_X,
      y: slot.y - PROFILE_FIRST_SHOWCASE_Y,
      height: slot.height,
    })),
  }
}

export const isKitBox = (box: SceneBox) => box.slots.length > 1

// Рамка витрины на холсте сцены: холст уже нарисован в нужном размере, поэтому режем без масштаба
export const slotFrame = (slot: SceneSlot): Frame => ({ x: slot.x, y: slot.y, scale: 1, height: slot.height })

export interface SceneRect {
  left: number
  right: number
  top: number
  bottom: number
}

// Слой на стыке частей витрины в профиле разрежет пополам. Заметить это на холсте трудно:
// зазор узкий, а картинка через него читается как целая
export function crossesSeam(box: SceneBox, rect: SceneRect): boolean {
  return box.slots.some((slot) => {
    if (rect.bottom <= slot.y || rect.top >= slot.y + slot.height) return false
    return sliceGaps(slot.kind).some((gap) => rect.left < slot.x + gap.end && rect.right > slot.x + gap.start)
  })
}

// Между витринами Steam рисует шапку и отступы, своей картинки там не видно вовсе
export function hiddenBetweenSlots(box: SceneBox, rect: SceneRect): boolean {
  if (!box.slots.length) return false
  return box.slots.every((slot) => rect.bottom <= slot.y || rect.top >= slot.y + slot.height)
}

// Фон профиля встаёт туда, где холст оказывается на странице, остальное вписываем по ширине
export function fitSceneFrame(box: SceneBox, imageWidth: number, imageHeight: number): Frame {
  if (isProfileBackground(imageWidth)) {
    return { ...box.origin, scale: 1, height: clampHeight(Math.min(imageHeight - box.origin.y, box.height)) }
  }
  const scale = imageWidth / box.width
  return { x: 0, y: 0, scale, height: clampHeight(imageHeight / scale) }
}

// Меняет масштаб фона, не сдвигая центр холста
export function zoomSceneFrame(box: SceneBox, frame: Frame, nextScale: number): Frame {
  const scale = Math.min(50, Math.max(0.05, nextScale))
  const cx = frame.x + (box.width * frame.scale) / 2
  const cy = frame.y + (frame.height * frame.scale) / 2
  return {
    ...frame,
    scale,
    x: Math.round(cx - (box.width * scale) / 2),
    y: Math.round(cy - (frame.height * scale) / 2),
  }
}
