import { useSyncExternalStore } from 'react'

// Человек попросил систему поменьше двигать картинку — сами анимацию не заводим.
// Включить вручную он всё равно может: это про то, что происходит без спроса

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export const useReducedMotion = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
