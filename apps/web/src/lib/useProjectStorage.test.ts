import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { packProject, type ProjectData } from '@profile-editor/core'

vi.mock('./projectsDb', () => ({
  projectsDb: { list: vi.fn(), load: vi.fn(), save: vi.fn(), remove: vi.fn() },
  askPersistentStorage: vi.fn(),
}))

import { projectsDb, type ProjectRecord } from './projectsDb'
import { useProjectStorage, type ProjectSnapshot, type Session } from './useProjectStorage'

const db = vi.mocked(projectsDb)

const project: Omit<ProjectData, 'thumbnail'> = {
  id: 'snapshot',
  name: 'Работа',
  updatedAt: 0,
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
}

const record = (id: string) => ({ id, name: id, updatedAt: 1 }) as unknown as ProjectRecord

interface Props {
  revision: unknown
  dirty: boolean
  autoload: boolean
  snapshot: () => ProjectSnapshot
  apply: (data: ProjectData, onlyIfEmpty?: boolean) => Promise<void>
  reset: () => void
}

function setup(over: Partial<Props> = {}) {
  const snapshot = vi.fn<() => ProjectSnapshot>(() => ({ project, thumbnail: null }))
  const apply = vi.fn(async () => {})
  const reset = vi.fn()
  const base: Props = { revision: 0, dirty: true, autoload: false, snapshot, apply, reset, ...over }
  const view = renderHook((props: Props) => useProjectStorage(props), { initialProps: base })
  // правка на странице: новое значение revision и есть сигнал «сохраняй заново»
  const edit = (patch: Partial<Props> = {}) => view.rerender({ ...base, revision: {}, ...patch })
  return { ...view, snapshot, apply, reset, edit }
}

// переждать паузу автосохранения вместе со всеми обещаниями внутри него
const settle = (ms = 1000) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

beforeEach(() => {
  vi.useFakeTimers()
  db.list.mockResolvedValue([])
  db.save.mockResolvedValue(undefined)
  db.remove.mockResolvedValue(undefined)
  db.load.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('автосохранение', () => {
  it('сохраняет работу после паузы в правках', async () => {
    const { result, edit } = setup()

    edit()
    expect(db.save).not.toHaveBeenCalled()
    await settle()

    expect(db.save).toHaveBeenCalledTimes(1)
    expect(db.save.mock.calls[0]?.[0]).toMatchObject({ id: 'snapshot', name: 'Работа', thumbnail: null })
    expect(result.current.saveState).toBe('saved')
  })

  it('несколько правок подряд складываются в одно сохранение', async () => {
    const { edit } = setup()

    edit()
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)))
    edit()
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)))
    edit()
    await settle()

    expect(db.save).toHaveBeenCalledTimes(1)
  })

  it('пустой холст в базу не попадает', async () => {
    const { edit } = setup({ dirty: false })

    edit()
    await settle()

    expect(db.save).not.toHaveBeenCalled()
  })

  it('показывает ошибку, если сохранить не вышло', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.save.mockRejectedValue(new Error('нет места'))
    const { result, edit } = setup()

    edit()
    await settle()

    expect(result.current.saveState).toBe('error')
  })

  it('только что открытый проект не пишется обратно, а следующая правка — да', async () => {
    const { result, edit } = setup()
    const loaded: Session = { id: 'p1', autoName: 'Проект' }

    act(() => result.current.adopt(loaded, { skip: true }))
    await settle()
    expect(db.save).not.toHaveBeenCalled()

    edit()
    await settle()
    expect(db.save).toHaveBeenCalledTimes(1)
  })
})

describe('проекты', () => {
  it('новый проект чистит холст, имя и заводит другую сессию', async () => {
    const { result, reset } = setup()
    const before = result.current.session.id

    act(() => result.current.setName('Моя работа'))
    act(() => result.current.newProject())

    expect(reset).toHaveBeenCalledTimes(1)
    expect(result.current.session.id).not.toBe(before)
    expect(result.current.name).toBe('')
    expect(result.current.saveState).toBe('idle')
  })

  it('открывает проект из базы и отдаёт его странице', async () => {
    const data = { ...project, thumbnail: null } as ProjectData
    db.load.mockResolvedValue(data)
    const { result, apply } = setup()

    await act(async () => void (await result.current.open('p1')))

    expect(db.load).toHaveBeenCalledWith('p1')
    expect(apply).toHaveBeenCalledWith(data, false)
  })

  it('жалуется, если проект из базы не читается', async () => {
    db.load.mockResolvedValue(null)
    const { result, apply } = setup()

    await act(async () => void (await result.current.open('p1')))

    expect(apply).not.toHaveBeenCalled()
    expect(result.current.error).toBe('open')
  })

  it('при входе продолжает последнюю работу, но не поверх начатой', async () => {
    const data = { ...project, thumbnail: null } as ProjectData
    db.list.mockResolvedValue([record('p1')])
    db.load.mockResolvedValue(data)
    const { apply } = setup({ autoload: true })

    await settle()

    expect(db.load).toHaveBeenCalledWith('p1')
    // onlyIfEmpty: страница сама решит, не начали ли за это время новую работу
    expect(apply).toHaveBeenCalledWith(data, true)
  })

  it('со ссылкой на фон в адресе последнюю работу не открывает', async () => {
    db.list.mockResolvedValue([record('p1')])
    const { apply } = setup({ autoload: false })

    await settle()

    expect(db.load).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })

  it('удаляет проект только после подтверждения', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = setup()

    act(() => result.current.remove(record('p1')))
    expect(db.remove).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    act(() => result.current.remove(record('p1')))
    await settle()

    expect(db.remove).toHaveBeenCalledWith('p1')
  })

  it('удаление текущего проекта расчищает холст', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { result, reset } = setup()

    act(() => result.current.remove(record(result.current.session.id)))
    await settle()

    expect(reset).toHaveBeenCalledTimes(1)
  })
})

describe('файл проекта', () => {
  const zipFile = async (data: ProjectData) =>
    new File([(await packProject(data)) as BlobPart], 'project.zip', { type: 'application/zip' })

  it('открывает проект из файла', async () => {
    const data = { ...project, id: 'fromFile', thumbnail: null } as ProjectData
    const file = await zipFile(data)
    const { result, apply } = setup()

    await act(async () => void (await result.current.importFile(file)))

    expect(db.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'fromFile' }))
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'fromFile' }))
  })

  it('уже знакомый проект кладёт копией, а не поверх', async () => {
    const data = { ...project, id: 'p1', thumbnail: null } as ProjectData
    const file = await zipFile(data)
    db.list.mockResolvedValue([record('p1')])
    const { result } = setup()
    await settle()

    await act(async () => void (await result.current.importFile(file)))

    const saved = db.save.mock.calls.at(-1)?.[0]
    expect(saved?.id).not.toBe('p1')
    expect(saved?.name).toBe('Работа')
  })

  it('ругается на битый файл', async () => {
    const { result } = setup()

    await act(async () => void (await result.current.importFile(new File(['не zip'], 'broken.zip'))))

    expect(result.current.error).toBe('import')
    expect(db.save).not.toHaveBeenCalled()
  })
})
