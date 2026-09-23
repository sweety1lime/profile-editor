import { useCallback, useEffect, useMemo, useState } from 'react'

// Картинки слоёв конструктора: bitmaps рисуют сцену, blobs уходят в файл проекта.
// version растёт, когда набор поменялся: по нему перерисовывается холст и запускается автосохранение

export interface Assets {
  bitmaps: Map<string, ImageBitmap>
  blobs: Map<string, Blob>
  version: number
  add(id: string, bitmap: ImageBitmap, blob: Blob): void
  // Выбросить всё, на что больше никто не ссылается. Удалённый слой сразу чистить нельзя:
  // его ещё может вернуть отмена, поэтому решение принимается по холсту вместе с историей
  keepOnly(alive: Set<string>): void
  // картинки открытого проекта вместо текущих
  load(bitmaps: Map<string, ImageBitmap>, blobs: Record<string, Blob>): void
  clear(): void
  bump(): void
}

export function useAssets(): Assets {
  const [bitmaps] = useState(() => new Map<string, ImageBitmap>())
  const [blobs] = useState(() => new Map<string, Blob>())
  const [version, setVersion] = useState(0)

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const clear = useCallback(() => {
    bitmaps.forEach((bitmap) => bitmap.close())
    bitmaps.clear()
    blobs.clear()
  }, [bitmaps, blobs])

  useEffect(() => () => bitmaps.forEach((bitmap) => bitmap.close()), [bitmaps])

  return useMemo<Assets>(
    () => ({
      bitmaps,
      blobs,
      version,
      bump,
      clear,
      add(id, bitmap, blob) {
        bitmaps.set(id, bitmap)
        blobs.set(id, blob)
        bump()
      },
      keepOnly(alive) {
        for (const id of [...bitmaps.keys()]) {
          if (alive.has(id)) continue
          bitmaps.get(id)?.close()
          bitmaps.delete(id)
        }
        for (const id of [...blobs.keys()]) if (!alive.has(id)) blobs.delete(id)
      },
      load(nextBitmaps, nextBlobs) {
        clear()
        nextBitmaps.forEach((bitmap, id) => bitmaps.set(id, bitmap))
        // файлы кладём все: картинка могла не раскодироваться, но терять её из проекта нельзя
        for (const [id, blob] of Object.entries(nextBlobs)) blobs.set(id, blob)
        bump()
      },
    }),
    [bitmaps, blobs, version, bump, clear],
  )
}
