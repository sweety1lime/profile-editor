import { UPLOAD_LIMIT_BYTES, kitFolder, sliceRects, type Frame, type ShowcaseKind, type Timeline } from '@profile-editor/core'
import { renderSlices, type ExportedFile, type OutFormat } from './exportSlices'
import type { AnimatedSource } from './animated'
import type { Progress } from './encodeGif'

// Резка одного исходника сразу на несколько витрин. Через неё ходят и комплект, и конструктор:
// одиночная витрина — это просто комплект из одного окна

export interface CutSlot {
  id: string
  kind: ShowcaseKind
  // где витрина лежит на исходнике
  frame: Frame
}

export interface ShowcaseGroup {
  id: string
  kind: ShowcaseKind
  files: ExportedFile[]
  frames?: number
  thinned?: boolean
}

export type CutProgress = ({ stage: 'still' } | Progress) & { showcase: number; showcases: number }

// Гифка какой-то части не влезла в лимит даже на самой бедной палитре
export class TooBigError extends Error {}

interface Options {
  slots: CutSlot[]
  still: CanvasImageSource | null
  animated: { source: AnimatedSource; timeline: Timeline } | null
  format: OutFormat
  hex: boolean
  onProgress: (progress: CutProgress) => void
}

export async function cutShowcases({ slots, still, animated, format, hex, onProgress }: Options): Promise<ShowcaseGroup[]> {
  const groups: ShowcaseGroup[] = []
  for (const [index, slot] of slots.entries()) {
    const where = { showcase: index + 1, showcases: slots.length }
    if (!animated) {
      if (!still) break
      onProgress({ stage: 'still', ...where })
      groups.push({ id: slot.id, kind: slot.kind, files: await renderSlices(still, sliceRects(slot.kind, slot.frame), format) })
      continue
    }
    // кодировщик держит в памяти кадры только одной витрины, поэтому идём по очереди
    const { encodeAnimated } = await import('./encodeGif')
    const encoded = await encodeAnimated(
      animated.source,
      slot.kind,
      slot.frame,
      animated.timeline,
      { limit: UPLOAD_LIMIT_BYTES, hex },
      (progress) => onProgress({ ...progress, ...where }),
    )
    if (!encoded) throw new TooBigError()
    groups.push({
      id: slot.id,
      kind: slot.kind,
      files: encoded.parts.map((part) => ({
        name: `${part.name}.gif`,
        blob: new Blob([part.bytes as BlobPart], { type: 'image/gif' }),
      })),
      frames: encoded.frameCount,
      thinned: encoded.step > 1,
    })
  }
  return groups
}

// Когда витрина одна, файлы лежат в архиве россыпью. Когда их несколько, у каждой своя папка:
// иначе части двух витрин одного вида перезапишут друг друга, да и порядок загрузки не виден
export const groupFiles = (groups: ShowcaseGroup[]): ExportedFile[] =>
  groups.length < 2
    ? (groups[0]?.files ?? [])
    : groups.flatMap((group, index) =>
        group.files.map((file) => ({ ...file, name: `${kitFolder(index, group.kind)}/${file.name}` })),
      )
