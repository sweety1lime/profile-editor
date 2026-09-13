import { PROFILE_BACKGROUND_WIDTH, SHOWCASES, type ShowcaseKind } from './geometry'
import { PROFILE_OFFSET } from './layout'

// Положение витрины на исходной картинке:
// x, y — левый верхний угол в пикселях исходника,
// scale — сколько пикселей исходника приходится на один пиксель витрины,
// height — высота витрины в пикселях профиля.
export interface Frame {
  x: number
  y: number
  scale: number
  height: number
}

export interface SliceRect {
  id: string
  name: string
  sx: number
  sy: number
  sw: number
  sh: number
  outWidth: number
  outHeight: number
}

export const MIN_FRAME_HEIGHT = 50
export const MAX_FRAME_HEIGHT = 4000
export const MIN_SCALE = 0.05
export const MAX_SCALE = 50
const DEFAULT_PROFILE_HEIGHT = 800

export const clampHeight = (height: number) =>
  Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.round(height)))

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

export const isProfileBackground = (width: number) => width === PROFILE_BACKGROUND_WIDTH

// Имена файлов с номером, чтобы было понятно, в каком порядке загружать
export function sliceFileName(kind: ShowcaseKind, index: number): string {
  const { slices } = SHOWCASES[kind]
  if (slices.length === 1) return kind
  if (kind === 'workshop') return `workshop_${index + 1}`
  return `${index + 1}_${slices[index]?.id ?? index + 1}`
}

export function sliceRects(kind: ShowcaseKind, frame: Frame): SliceRect[] {
  const showcase = SHOWCASES[kind]
  return showcase.slices.map((slice, i) => {
    const outWidth = showcase.exportWidth ?? Math.round(slice.width)
    return {
      id: slice.id,
      name: sliceFileName(kind, i),
      sx: frame.x + slice.x * frame.scale,
      sy: frame.y,
      sw: slice.width * frame.scale,
      sh: frame.height * frame.scale,
      outWidth,
      outHeight: Math.max(1, Math.round(frame.height * (outWidth / slice.width))),
    }
  })
}

// Фон профиля ставим туда, где окажется первая витрина на странице, остальное вписываем по ширине
export function fitFrame(kind: ShowcaseKind, imageWidth: number, imageHeight: number): Frame {
  if (isProfileBackground(imageWidth)) {
    const { x, y } = PROFILE_OFFSET[kind]
    return { x, y, scale: 1, height: clampHeight(Math.min(imageHeight - y, DEFAULT_PROFILE_HEIGHT)) }
  }
  const scale = imageWidth / SHOWCASES[kind].width
  return { x: 0, y: 0, scale, height: clampHeight(imageHeight / scale) }
}

// Меняет масштаб, не сдвигая центр витрины
export function zoomFrame(kind: ShowcaseKind, frame: Frame, nextScale: number): Frame {
  const scale = clampScale(nextScale)
  const width = SHOWCASES[kind].width
  const cx = frame.x + (width * frame.scale) / 2
  const cy = frame.y + (frame.height * frame.scale) / 2
  return {
    ...frame,
    scale,
    x: Math.round(cx - (width * scale) / 2),
    y: Math.round(cy - (frame.height * scale) / 2),
  }
}
