import { useEffect, useMemo, useState } from 'react'

// Ссылки создаём в эффекте, а не в useMemo: в режиме разработки React запускает эффекты дважды,
// и ссылка из useMemo успевала освободиться, пока картинка ещё на экране
export function useObjectUrls(blobs: readonly Blob[]): string[] {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    const next = blobs.map((blob) => URL.createObjectURL(blob))
    setUrls(next)
    return () => next.forEach((url) => URL.revokeObjectURL(url))
  }, [blobs])

  return urls
}

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const list = useMemo(() => (blob ? [blob] : []), [blob])
  return useObjectUrls(list)[0] ?? null
}
