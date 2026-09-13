import { strToU8, zipSync } from 'fflate'
import type { SliceRect } from '@profile-editor/core'

export type OutFormat = 'png' | 'jpg'

export interface ExportedFile {
  name: string
  blob: Blob
}

function toBlob(canvas: HTMLCanvasElement, format: OutFormat): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      format === 'png' ? 'image/png' : 'image/jpeg',
      0.92,
    )
  })
}

export async function renderSlices(
  source: CanvasImageSource,
  rects: SliceRect[],
  format: OutFormat,
): Promise<ExportedFile[]> {
  return Promise.all(
    rects.map(async (rect) => {
      const canvas = document.createElement('canvas')
      canvas.width = rect.outWidth
      canvas.height = rect.outHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      // у jpg нет прозрачности, поля за краем картинки делаем чёрными
      if (format === 'jpg') {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.outWidth, rect.outHeight)
      return { name: `${rect.name}.${format}`, blob: await toBlob(canvas, format) }
    }),
  )
}

export async function buildZip(files: ExportedFile[], readme: string): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {}
  for (const file of files) entries[file.name] = new Uint8Array(await file.blob.arrayBuffer())
  entries['readme.txt'] = strToU8(readme)
  // картинки и так сжаты, повторно жать смысла нет
  const zipped = zipSync(entries, { level: 0 })
  return new Blob([zipped as BlobPart], { type: 'application/zip' })
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const toMegabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2)
