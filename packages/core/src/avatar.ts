// Аватар профиля из того же арта, что и витрины: квадрат, вырезанный из исходника.
// Свой анимированный аватар Steam не принимает, анимированные бывают только из магазина очков,
// поэтому аватар всегда статичный. Steam хранит его размером 184 px и сам ужимает для списка
// друзей и чата

export const AVATAR_SIZE = 184

// Где аватар видно и каким размером
export const AVATAR_VIEWS = [
  { id: 'profile', size: 164 },
  { id: 'friends', size: 64 },
  { id: 'chat', size: 32 },
] as const

export const MIN_AVATAR_CROP = 16

// Квадрат в пикселях исходника
export interface AvatarCrop {
  x: number
  y: number
  size: number
}

// Квадрат целиком внутри картинки: за её краем в аватаре остались бы пустые поля
export function clampAvatarCrop(crop: AvatarCrop, imageWidth: number, imageHeight: number): AvatarCrop {
  const size = Math.round(Math.min(Math.max(crop.size, MIN_AVATAR_CROP), imageWidth, imageHeight))
  return {
    size,
    x: Math.round(Math.min(Math.max(crop.x, 0), imageWidth - size)),
    y: Math.round(Math.min(Math.max(crop.y, 0), imageHeight - size)),
  }
}

// Для начала — квадрат по центру в верхней части картинки: у артов с персонажем там обычно лицо
export function defaultAvatarCrop(imageWidth: number, imageHeight: number): AvatarCrop {
  const size = Math.min(imageWidth, imageHeight) * 0.45
  return clampAvatarCrop({ x: (imageWidth - size) / 2, y: imageHeight * 0.12, size }, imageWidth, imageHeight)
}

// Меняет размер квадрата, не сдвигая его центр, пока квадрат не упрётся в край картинки
export function resizeAvatarCrop(crop: AvatarCrop, size: number, imageWidth: number, imageHeight: number): AvatarCrop {
  const cx = crop.x + crop.size / 2
  const cy = crop.y + crop.size / 2
  return clampAvatarCrop({ x: cx - size / 2, y: cy - size / 2, size }, imageWidth, imageHeight)
}
