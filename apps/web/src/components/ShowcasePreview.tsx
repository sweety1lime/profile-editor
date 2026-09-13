import { useMemo } from 'react'
import { SHOWCASES, type ShowcaseKind } from '@profile-editor/core'
import type { ExportedFile } from '../lib/exportSlices'
import { useObjectUrls } from '../lib/useObjectUrl'

interface Props {
  kind: ShowcaseKind
  files: ExportedFile[]
  caption?: string
}

// Показывает части в тех же размерах и с теми же зазорами, что и на странице профиля
export default function ShowcasePreview({ kind, files, caption }: Props) {
  const blobs = useMemo(() => files.map((f) => f.blob), [files])
  const urls = useObjectUrls(blobs)
  const { slices } = SHOWCASES[kind]

  return (
    <div className="flex h-full flex-col items-center overflow-auto p-8 pt-16">
      {caption && <p className="mb-4 max-w-md text-center text-xs text-slate-500">{caption}</p>}
      <div className="flex shrink-0 items-start rounded bg-black/40 p-2">
        {slices.map((slice, i) => {
          const prev = slices[i - 1]
          const gap = prev ? slice.x - (prev.x + prev.width) : 0
          return urls[i] ? (
            <img key={slice.id} src={urls[i]} alt="" className="block h-auto" style={{ width: slice.width, marginLeft: gap }} />
          ) : null
        })}
      </div>
    </div>
  )
}
