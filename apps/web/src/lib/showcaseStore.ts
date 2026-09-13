import { useSyncExternalStore } from 'react'
import type { ShowcaseKind } from '@profile-editor/core'
import type { ExportedFile } from './exportSlices'

// Общее место, через которое нарезчик отдаёт готовые витрины и фон в превью профиля.
// Живёт только пока открыта вкладка, на сервер ничего не уходит

export interface ShowcaseDraft {
  id: string
  kind: ShowcaseKind
  files: ExportedFile[]
}

export interface BackgroundDraft {
  blob: Blob
  isVideo: boolean
}

interface State {
  showcases: ShowcaseDraft[]
  background: BackgroundDraft | null
}

let state: State = { showcases: [], background: null }
const listeners = new Set<() => void>()

function update(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

export const showcaseStore = {
  addShowcase(kind: ShowcaseKind, files: ExportedFile[]) {
    update({ showcases: [...state.showcases, { id: crypto.randomUUID(), kind, files }] })
  },
  removeShowcase(id: string) {
    update({ showcases: state.showcases.filter((s) => s.id !== id) })
  },
  moveShowcase(id: string, delta: number) {
    const list = [...state.showcases]
    const from = list.findIndex((s) => s.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= list.length) return
    list.splice(to, 0, ...list.splice(from, 1))
    update({ showcases: list })
  },
  setBackground(background: BackgroundDraft | null) {
    update({ background })
  },
}

export function useShowcaseStore(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}
