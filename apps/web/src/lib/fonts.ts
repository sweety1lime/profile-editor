import { useEffect, useState } from 'react'
import type { Layer } from '@profile-editor/core'
import '@fontsource/russo-one'
import '@fontsource/rubik/400.css'
import '@fontsource/rubik/700.css'
import '@fontsource/comfortaa/400.css'
import '@fontsource/comfortaa/700.css'
import '@fontsource/pacifico'

// Шрифты для надписей: первые четыре с кириллицей и лежат у нас, остальные системные
export const FONTS = ['Russo One', 'Rubik', 'Comfortaa', 'Pacifico', 'Inter Variable', 'Arial', 'Georgia', 'Impact']

// Canvas не ждёт загрузки шрифта сам: подгружаем нужные и просим перерисовать сцену
export function useFontsReady(layers: Layer[]): number {
  const [version, setVersion] = useState(0)
  const key = [...new Set(layers.flatMap((l) => (l.type === 'text' ? [`${l.weight}|${l.font}`] : [])))].join(',')

  useEffect(() => {
    if (!key) return
    let alive = true
    Promise.all(
      key.split(',').map((entry) => {
        const [weight, font] = entry.split('|')
        return document.fonts.load(`${weight} 32px "${font}"`)
      }),
    )
      .then(() => alive && setVersion((v) => v + 1))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [key])

  return version
}
