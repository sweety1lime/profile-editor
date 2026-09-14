import type { ProjectData } from '@profile-editor/core'

// Проекты конструктора хранятся в IndexedDB этого браузера, на сервер ничего не уходит.
// Настройки и слои лежат отдельно от файлов: фон может весить десятки мегабайт,
// поэтому каждый файл пишем один раз, а при сохранении перезаписываем только настройки

const DB_NAME = 'profile-editor'
const PROJECTS = 'projects'
const FILES = 'files'

export interface ProjectRecord extends Omit<ProjectData, 'background' | 'assets'> {
  background: { file: string; name: string } | null
  assets: Record<string, string>
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROJECTS, { keyPath: 'id' })
      request.result.createObjectStore(FILES)
    }
    request.onsuccess = () => resolve(request.result)
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
