import { parseProfileRef } from '@profile-editor/core'

export interface SourceImage {
  image: ImageBitmap | HTMLImageElement
  width: number
  height: number
  name: string
}

export type SourceErrorCode = 'unsupported_link' | 'load_failed' | 'no_background' | 'not_found' | 'steam_unavailable'

export class SourceError extends Error {
  code: SourceErrorCode

  constructor(code: SourceErrorCode) {
    super(code)
    this.code = code
  }
}

export async function fromFile(file: File): Promise<SourceImage> {
  if (!file.type.startsWith('image/')) throw new SourceError('load_failed')
  try {
    const bitmap = await createImageBitmap(file)
    return { image: bitmap, width: bitmap.width, height: bitmap.height, name: file.name }
  } catch {
    throw new SourceError('load_failed')
  }
}

function isImageUrl(value: string) {
  return /^https?:\/\//i.test(value) && (/\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(value) || /steamstatic\.com\//i.test(value))
}

// crossOrigin нужен, чтобы потом можно было читать пиксели из canvas.
// Если сайт с картинкой не разрешает это, картинка просто не загрузится
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new SourceError('load_failed'))
    img.src = url
  })
}

// Ссылка на картинку грузится как есть, ссылка на профиль — берём его фон через наш прокси
export async function fromLink(raw: string): Promise<SourceImage> {
  const value = raw.trim()
  let url = value
  let name = value.split('/').pop()?.split('?')[0] || 'image'

  if (!isImageUrl(value)) {
    if (!parseProfileRef(value)) throw new SourceError('unsupported_link')
    const res = await fetch(`/api/steam/profile?id=${encodeURIComponent(value)}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new SourceError(body.error === 'not_found' ? 'not_found' : 'steam_unavailable')
    if (!body.background?.image) throw new SourceError('no_background')
    url = body.background.image
    name = body.background.name ?? 'background'
  }

  const img = await loadImage(url)
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, name }
}
