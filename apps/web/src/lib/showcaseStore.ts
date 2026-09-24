import { useSyncExternalStore } from 'react'
import type { KitItemKind, ShowcaseKind } from '@profile-editor/core'
import type { ExportedFile } from './exportSlices'

// Общее место, через которое нарезчик и каталог отдают данные в превью профиля.
// Живёт только пока открыта вкладка, на сервер ничего не уходит

export interface ShowcaseDraft {
  id: string
  kind: KitItemKind
  files: ExportedFile[]
  // у другой витрины — высота всего блока, картинок у неё нет
  height?: number
  // плашка «+N» под правой колонкой, не задано — есть
  counter?: boolean
}

export interface BackgroundDraft {
  blob: Blob
  isVideo: boolean
}

// Что примерить из каталога: превью заберёт это при открытии
export interface TryOn {
  background?: { url: string; isVideo: boolean }
  frame?: string
  avatar?: string
  // свой аватар из комплекта
  avatarFile?: File
}

interface State {
  showcases: ShowcaseDraft[]
  background: BackgroundDraft | null
  tryOn: TryOn | null
}

let state: State = { showcases: [], background: null, tryOn: null }
const listeners = new Set<() => void>()

function update(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

export const showcaseStore = {
  addShowcase(kind: ShowcaseKind, files: ExportedFile[], options: { counter?: boolean } = {}) {
    update({ showcases: [...state.showcases, { id: crypto.randomUUID(), kind, files, counter: options.counter }] })
  },
  // Другая витрина между витринами комплекта: своих картинок у неё нет, но она сдвигает всё ниже
  addOther(height: number) {
    update({ showcases: [...state.showcases, { id: crypto.randomUUID(), kind: 'other', files: [], height }] })
  },
  setHeight(id: string, height: number) {
    update({ showcases: state.showcases.map((s) => (s.id === id ? { ...s, height } : s)) })
  },
  setCounter(id: string, counter: boolean) {
    update({ showcases: state.showcases.map((s) => (s.id === id ? { ...s, counter } : s)) })
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
  tryOn(next: TryOn) {
    update({ tryOn: { ...state.tryOn, ...next } })
  },
  clearTryOn() {
    update({ tryOn: null })
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
