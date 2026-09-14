import type { Frame, ProjectData, ShowcaseKind } from '@profile-editor/core'

// Всё, что сайт хранит в IndexedDB этого браузера: проекты конструктора и последняя работа нарезчика.
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

export interface CutterSession {
  name: string
  kind: ShowcaseKind
  frame: Frame | null
  clip: { start: number; length: number; fps: number } | null
  hex: boolean
  format: 'png' | 'jpg'
  savedAt: number
}

const CUTTER = 'cutter'
const CUTTER_SOURCE = 'cutter:source'
// исходник нарезчика тоже пишем, только когда он сменился
let savedSource: Blob | null = null

export const cutterDb = {
  async load(): Promise<{ session: CutterSession; blob: Blob } | null> {
    const db = await openDb()
    const store = db.transaction(SESSIONS).objectStore(SESSIONS)
    const [session, blob] = await Promise.all([
      done<CutterSession | undefined>(store.get(CUTTER)),
      done<Blob | undefined>(store.get(CUTTER_SOURCE)),
    ])
    if (!session || !blob) return null
    savedSource = blob
    return { session, blob }
  },

  async save(session: CutterSession, blob: Blob): Promise<void> {
    const db = await openDb()
    const tx = db.transaction(SESSIONS, 'readwrite')
    const store = tx.objectStore(SESSIONS)
    store.put(session, CUTTER)
    const fresh = blob !== savedSource
    if (fresh) store.put(blob, CUTTER_SOURCE)
    await finished(tx)
    if (fresh) savedSource = blob
  },

  async clear(): Promise<void> {
    const db = await openDb()
    const tx = db.transaction(SESSIONS, 'readwrite')
    tx.objectStore(SESSIONS).clear()
    await finished(tx)
    savedSource = null
  },
}

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
