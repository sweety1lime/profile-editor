import { Blob as NodeBlob } from 'node:buffer'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectData } from '@profile-editor/core'

// База кэширует соединение в модуле, поэтому берём и то и другое заново на каждый тест
async function freshDb() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  const { projectsDb, cutterDb } = await import('./projectsDb')
  return { projectsDb, cutterDb }
}

// Blob из jsdom fake-indexeddb кладёт в базу пустым объектом: structuredClone из node его не узнаёт.
// Блобы самого node переживают запись целиком, а базе всё равно, чьи они
const file = (text: string) => new NodeBlob([text], { type: 'image/png' }) as unknown as Blob

const project = (over: Partial<ProjectData> = {}): ProjectData => ({
  id: 'p1',
  name: 'Работа',
  updatedAt: 1,
  kind: 'artwork',
  kit: null,
  height: 700,
  frame: null,
  durationMs: 2000,
  fps: 15,
  format: 'png',
  hex: false,
  layers: [],
  background: null,
  assets: {},
  thumbnail: null,
  ...over,
})

// сколько файлов реально лежит в базе
function storedFiles(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('profile-editor')
    request.onsuccess = () => {
      const db = request.result
      const keys = db.transaction('files').objectStore('files').getAllKeys()
      keys.onsuccess = () => {
        resolve(keys.result.map(String))
        db.close()
      }
      keys.onerror = () => reject(keys.error)
    }
    request.onerror = () => reject(request.error)
  })
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('проекты в браузере', () => {
  it('сохраняет и возвращает работу целиком', async () => {
    const { projectsDb } = await freshDb()
    const background = file('фон')

    await projectsDb.save(project({ background: { blob: background, name: 'bg.png' }, assets: { a: file('слой') } }))
    const loaded = await projectsDb.load('p1')

    expect(loaded?.name).toBe('Работа')
    expect(loaded?.background?.name).toBe('bg.png')
    expect(await loaded?.background?.blob.text()).toBe('фон')
    expect(await loaded?.assets.a?.text()).toBe('слой')
  })

  it('тот же файл второй раз не пишет', async () => {
    const { projectsDb } = await freshDb()
    const background = file('фон')

    await projectsDb.save(project({ background: { blob: background, name: 'bg.png' } }))
    const after = await storedFiles()
    // правим только настройки, фон тот же самый
    await projectsDb.save(project({ background: { blob: background, name: 'bg.png' }, height: 900 }))

    expect(await storedFiles()).toEqual(after)
    expect(after).toHaveLength(1)
  })

  it('старый фон удаляет, когда положили новый', async () => {
    const { projectsDb } = await freshDb()

    await projectsDb.save(project({ background: { blob: file('старый'), name: 'old.png' } }))
    await projectsDb.save(project({ background: { blob: file('новый'), name: 'new.png' } }))

    expect(await storedFiles()).toHaveLength(1)
    expect(await (await projectsDb.load('p1'))?.background?.blob.text()).toBe('новый')
  })

  it('удаляет проект вместе с его файлами, не трогая чужие', async () => {
    const { projectsDb } = await freshDb()
    await projectsDb.save(project({ id: 'p1', background: { blob: file('первый'), name: 'a.png' } }))
    await projectsDb.save(project({ id: 'p2', background: { blob: file('второй'), name: 'b.png' } }))

    await projectsDb.remove('p1')

    expect(await projectsDb.load('p1')).toBeNull()
    const left = await storedFiles()
    expect(left).toHaveLength(1)
    expect(left[0]?.startsWith('p2/')).toBe(true)
  })

  it('показывает работы от свежих к старым', async () => {
    const { projectsDb } = await freshDb()
    await projectsDb.save(project({ id: 'p1', updatedAt: 10 }))
    await projectsDb.save(project({ id: 'p2', updatedAt: 30 }))
    await projectsDb.save(project({ id: 'p3', updatedAt: 20 }))

    expect((await projectsDb.list()).map((p) => p.id)).toEqual(['p2', 'p3', 'p1'])
  })
})

describe('последняя работа нарезчика', () => {
  const session = {
    name: 'art.png',
    kind: 'artwork' as const,
    frame: null,
    clip: null,
    hex: false,
    format: 'png' as const,
    savedAt: 1,
  }

  it('возвращает то, что резали в прошлый раз', async () => {
    const { cutterDb } = await freshDb()

    await cutterDb.save(session, file('исходник'))
    const restored = await cutterDb.load()

    expect(restored?.session.name).toBe('art.png')
    expect(await restored?.blob.text()).toBe('исходник')
  })

  it('забывает всё по просьбе', async () => {
    const { cutterDb } = await freshDb()
    await cutterDb.save(session, file('исходник'))

    await cutterDb.clear()

    expect(await cutterDb.load()).toBeNull()
  })
})
