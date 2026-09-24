import { useEffect, useState } from 'react'

// Картинка по ссылке, когда догрузится. Холсты её только рисуют и пиксели не читают,
// поэтому чужой сервер без разрешения на чтение не мешает
export function useLoadedImage(url: string | undefined): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null)

  useEffect(() => {
    if (!url) return
    let alive = true
    const image = new Image()
    image.onload = () => {
      if (alive) setLoaded({ url, image })
    }
    image.src = url
    return () => {
      alive = false
    }
  }, [url])

  // пока новая не догрузилась, старую не показываем
  return loaded && loaded.url === url ? loaded.image : null
}
