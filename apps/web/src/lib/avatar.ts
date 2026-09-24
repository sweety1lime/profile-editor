import { AVATAR_SIZE, type AvatarCrop } from '@profile-editor/core'

// Аватар рисуем на чёрном: Steam всё равно пережмёт его в JPG, и прозрачность у вырезанного
// персонажа превратится во что-то своё. Пусть лучше сразу будет видно, что выйдет
export function drawAvatar(ctx: CanvasRenderingContext2D, image: CanvasImageSource, crop: AvatarCrop, size: number) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, size, size)
}

export function renderAvatar(image: CanvasImageSource, crop: AvatarCrop): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  drawAvatar(canvas.getContext('2d')!, image, crop, AVATAR_SIZE)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
  )
}
