import type { Frame, KitItem, KitPlacement, ProjectData, ShowcaseKind } from '@profile-editor/core'
import type { OutFormat } from './exportSlices'

interface Clip {
  start: number
  length: number
  fps: number
}

// Всё, что сайт хранит в IndexedDB этого браузера: проекты конструктора и незаконченная работа
// нарезчика и комплекта.
// На сервер ничего не уходит. Настройки лежат отдельно от файлов: фон может весить десятки мегабайт,
// поэтому каждый файл пишем один раз, а при сохранении перезаписываем только настройки

const DB_NAME = 'profile-editor'
const DB_VERSION = 2
const PROJECTS = 'projects'
const FILES = 'files'
const SESSIONS = 'sessions'

export interface ProjectRecord extends Omit<ProjectData, 'background' | 'assets'> {
  background: { file: string; name: string } | null
  assets: Record<string, string>
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES)
      if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS)
    }
    request.onsuccess = () => {
      const db = request.result
      // вкладка с новой версией сайта обновляет базу, эта отпускает её
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
  })
  return dbPromise
}

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('aborted'))
  })

// Под каким ключом уже лежит файл. Один и тот же Blob второй раз не пишем
const storedKeys = new WeakMap<Blob, string>()

const filesOf = (record: ProjectRecord) => [
  ...(record.background ? [record.background.file] : []),
  ...Object.values(record.assets),
]

export const projectsDb = {
  async list(): Promise<ProjectRecord[]> {
    const db = await openDb()
    const all = await done<ProjectRecord[]>(db.transaction(PROJECTS).objectStore(PROJECTS).getAll())
    return all.sort((a, b) => b.updatedAt - a.updatedAt)
  },

  async load(id: string): Promise<ProjectData | null> {
    const db = await openDb()
    const tx = db.transaction([PROJECTS, FILES])
    const record = await done<ProjectRecord | undefined>(tx.objectStore(PROJECTS).get(id))
    if (!record) return null
    const files = tx.objectStore(FILES)
    const read = async (key: string) => {
      const blob = await done<Blob | undefined>(files.get(key))
      if (!blob) throw new Error(`missing file ${key}`)
      storedKeys.set(blob, key)
      return blob
    }
    const assets: Record<string, Blob> = {}
    for (const [assetId, key] of Object.entries(record.assets)) assets[assetId] = await read(key)
    return {
      ...record,
      background: record.background ? { blob: await read(record.background.file), name: record.background.name } : null,
      assets,
    }
  },

  async save(project: ProjectData): Promise<void> {
    const db = await openDb()
    const tx = db.transaction([PROJECTS, FILES], 'readwrite')
    const projects = tx.objectStore(PROJECTS)
    const files = tx.objectStore(FILES)
    const written: [Blob, string][] = []

    const keyFor = (blob: Blob) => {
      const known = storedKeys.get(blob)
      if (known?.startsWith(`${project.id}/`)) return known
      const key = `${project.id}/${crypto.randomUUID()}`
      files.put(blob, key)
      written.push([blob, key])
      return key
    }

    const record: ProjectRecord = {
      ...project,
      background: project.background ? { file: keyFor(project.background.blob), name: project.background.name } : null,
      assets: Object.fromEntries(Object.entries(project.assets).map(([assetId, blob]) => [assetId, keyFor(blob)])),
    }

    // файлы, которые проекту больше не нужны, удаляем в той же транзакции
    const previous = await done<ProjectRecord | undefined>(projects.get(project.id))
    projects.put(record)
    if (previous) {
      const keep = new Set(filesOf(record))
      for (const key of filesOf(previous)) if (!keep.has(key)) files.delete(key)
    }

    await finished(tx)
    for (const [blob, key] of written) storedKeys.set(blob, key)
  },

  async remove(id: string): Promise<void> {
    const db = await openDb()
    const tx = db.transaction([PROJECTS, FILES], 'readwrite')
    tx.objectStore(PROJECTS).delete(id)
    // ключи файлов вида "<id>/<uuid>", а "0" по порядку идёт сразу за "/"
    tx.objectStore(FILES).delete(IDBKeyRange.bound(`${id}/`, `${id}0`, false, true))
    await finished(tx)
  },
}

interface Session {
  savedAt: number
}

export interface CutterSession extends Session {
  name: string
  kind: ShowcaseKind
  frame: Frame | null
  clip: Clip | null
  hex: boolean
  format: OutFormat
}

export interface KitSession extends Session {
  name: string
  items: KitItem[]
  placement: KitPlacement
  clip: Clip | null
  hex: boolean
  format: OutFormat
}

// Незаконченная работа страницы: настройки и исходник к ним. Исходник весит куда больше настроек,
// поэтому пишем его, только когда он сменился, а страницы держат свои ключи и не трогают чужие
function sessionStore<T extends Session>(key: string) {
  const sourceKey = `${key}:source`
  let savedSource: Blob | null = null

  return {
    async load(): Promise<{ session: T; blob: Blob } | null> {
      const db = await openDb()
      const store = db.transaction(SESSIONS).objectStore(SESSIONS)
      const [session, blob] = await Promise.all([
        done<T | undefined>(store.get(key)),
        done<Blob | undefined>(store.get(sourceKey)),
      ])
      if (!session || !blob) return null
      savedSource = blob
      return { session, blob }
    },

    async save(session: T, blob: Blob): Promise<void> {
      const db = await openDb()
      const tx = db.transaction(SESSIONS, 'readwrite')
      const store = tx.objectStore(SESSIONS)
      store.put(session, key)
      const fresh = blob !== savedSource
      if (fresh) store.put(blob, sourceKey)
      await finished(tx)
      if (fresh) savedSource = blob
    },

    async clear(): Promise<void> {
      const db = await openDb()
      const tx = db.transaction(SESSIONS, 'readwrite')
      const store = tx.objectStore(SESSIONS)
      store.delete(key)
      store.delete(sourceKey)
      await finished(tx)
      savedSource = null
    },
  }
}

export const cutterDb = sessionStore<CutterSession>('cutter')
export const kitDb = sessionStore<KitSession>('kit')

// Просим браузер не выбрасывать сохранённое, когда место на диске кончается
let asked = false
export function askPersistentStorage() {
  if (asked) return
  asked = true
  navigator.storage?.persist?.().catch(() => {})
}

export async function bitmapToBlob(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}
