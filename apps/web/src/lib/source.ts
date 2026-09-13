import { parseProfileRef } from '@profile-editor/core'
import type { AnimatedSource } from './animated'

// Декодеры видео и гифок тяжёлые, грузим их только когда они нужны
const decoders = () => import('./animated')

export interface StillSource {
  type: 'still'
  image: ImageBitmap
  width: number
  height: number
  name: string
}

export type Source = StillSource | AnimatedSource

export type SourceErrorCode =
  | 'unsupported_link'
  | 'load_failed'
  | 'cannot_decode'
  | 'no_background'
  | 'not_found'
  | 'steam_unavailable'

export class SourceError extends Error {
  code: SourceErrorCode

  constructor(code: SourceErrorCode) {
    super(code)
    this.code = code
  }
}

const isVideo = (type: string, name: string) => type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(name)
const isGif = (type: string, name: string) => type === 'image/gif' || /\.gif$/i.test(name)

async function fromBlob(blob: Blob, name: string): Promise<Source> {
  if (isVideo(blob.type, name)) {
    try {
      const { openVideo } = await decoders()
      return await openVideo(blob, name)
    } catch (err) {
      console.warn('video decode failed:', err)
      throw new SourceError('cannot_decode')
    }
  }
  if (isGif(blob.type, name)) {
    const { openGif } = await decoders()
    const gif = await openGif(blob, name).catch(() => null)
    if (gif) return gif
  }
  try {
    const image = await createImageBitmap(blob)
    return { type: 'still', image, width: image.width, height: image.height, name }
  } catch {
    throw new SourceError('load_failed')
  }
}

export const fromFile = (file: File) => fromBlob(file, file.name)

// Картинку качаем целиком. Сайт должен разрешать CORS, иначе потом нельзя будет читать пиксели
async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url).catch(() => null)
  if (!res?.ok) throw new SourceError('load_failed')
  return res.blob()
}

const fileName = (url: string) => url.split('/').pop()?.split('?')[0] || 'image'

// Прямая ссылка на файл грузится как есть, у ссылки на профиль берём фон через наш прокси
export async function fromLink(raw: string): Promise<Source> {
  const value = raw.trim()
  const isProfileLink = /steamcommunity\.com\/(id|profiles)\//i.test(value)

  if (/^https?:\/\//i.test(value) && !isProfileLink) {
    return fromBlob(await fetchBlob(value), fileName(value))
  }
  if (!parseProfileRef(value)) throw new SourceError('unsupported_link')

  const res = await fetch(`/api/steam/profile?id=${encodeURIComponent(value)}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new SourceError(body.error === 'not_found' ? 'not_found' : 'steam_unavailable')

  const background = body.background as { image?: string; webm?: string; mp4?: string; name?: string } | undefined
  if (!background?.image) throw new SourceError('no_background')

  // сначала пробуем анимированный фон, если браузер не справится с кодеком, берём картинку
  for (const video of [background.webm, background.mp4]) {
    if (!video) continue
    try {
      const { openVideo } = await decoders()
      return await openVideo(await fetchBlob(video), background.name ?? fileName(video))
    } catch {
      // пробуем следующий вариант
    }
  }
  return fromBlob(await fetchBlob(background.image), background.name ?? fileName(background.image))
}

export function disposeSource(source: Source) {
  if (source.type === 'still') source.image.close()
  else source.dispose()
}
