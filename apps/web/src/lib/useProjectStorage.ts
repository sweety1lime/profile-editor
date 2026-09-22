import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { packProject, unpackProject, type ProjectData } from '@profile-editor/core'
import { download } from './exportSlices'
import { askPersistentStorage, projectsDb, type ProjectRecord } from './projectsDb'

// Проекты конструктора: автосохранение в браузер, список работ и перенос файлом.
// Что именно сохранять и как разложить обратно, знает страница — она даёт snapshot и apply

export interface Session {
  id: string
  autoName: string
}

export interface ProjectSnapshot {
  project: Omit<ProjectData, 'thumbnail'>
  thumbnail: HTMLCanvasElement | null
}

export type ProjectError = 'import' | 'open'

export type SaveState = 'idle' | 'saved' | 'error'

interface Options {
  // новое значение означает «работу пора пересохранить»
  revision: unknown
  // пока на холсте пусто, проект не заводим
  dirty: boolean
  // открывать ли последнюю работу при входе
  autoload: boolean
  snapshot: () => ProjectSnapshot
  // разложить проект по холсту; onlyIfEmpty — не поверх уже начатой работы
  apply: (data: ProjectData, onlyIfEmpty?: boolean) => Promise<void>
  // очистить холст под новый проект
  reset: () => void
}

// проект сохраняется после небольшой паузы в правках
const SAVE_DELAY = 600

const newId = () => crypto.randomUUID()
const fileSafe = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project'

const toJpeg = (canvas: HTMLCanvasElement | null) =>
  canvas ? new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8)) : Promise.resolve(null)

export function useProjectStorage(options: Options) {
  const { t, i18n } = useTranslation()
  const { revision } = options

  const freshSession = (): Session => ({
    id: newId(),
    autoName: t('builder.projects.untitled', {
      date: new Date().toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }),
    }),
  })

  const [session, setSession] = useState(freshSession)
  const [name, setName] = useState('')
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<ProjectError | null>(null)

  const sessionRef = useRef(session)
  const skipSave = useRef<Session | null>(null)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const autoloaded = useRef(false)
  // страница перерисовывается чаще, чем идут сохранения, поэтому колбэки читаем свежими
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })

  // сохранения и удаления идут строго по очереди, чтобы не перетирать друг друга
  function queue<T>(task: () => Promise<T>): Promise<T> {
    const next = saveQueue.current.then(task)
    saveQueue.current = next.catch(() => {})
    return next
  }

  function refresh() {
    projectsDb
      .list()
      .then(setProjects)
      .catch(() => {})
  }

  // Перейти на другую работу. skipSave — открыли готовый проект, обратно его сразу не пишем
  function adopt(next: Session, { skip = false } = {}) {
    if (skip) skipSave.current = next
    sessionRef.current = next
    setSession(next)
    setSaveState('idle')
    setError(null)
  }

  function newProject() {
    latest.current.reset()
    adopt(freshSession())
    setName('')
  }

  async function open(id: string, onlyIfEmpty = false) {
    setError(null)
    const data = await projectsDb.load(id).catch(() => null)
    if (data) await latest.current.apply(data, onlyIfEmpty)
    else setError('open')
  }

  function remove(project: ProjectRecord) {
    if (!window.confirm(t('builder.projects.confirmDelete', { name: project.name }))) return
    if (project.id === sessionRef.current.id) newProject()
    queue(() => projectsDb.remove(project.id))
      .catch(() => {})
      .finally(refresh)
  }

  async function exportFile() {
    const { project, thumbnail } = latest.current.snapshot()
    const bytes = await packProject({ ...project, thumbnail: await toJpeg(thumbnail) })
    download(new Blob([bytes as BlobPart], { type: 'application/zip' }), `${fileSafe(project.name)}.zip`)
  }

  async function importFile(file: File) {
    setError(null)
    let data: ProjectData
    try {
      data = unpackProject(new Uint8Array(await file.arrayBuffer()))
    } catch {
      setError('import')
      return
    }
    // такой проект уже есть в браузере: кладём копию рядом, а не поверх
    if (projects.some((p) => p.id === data.id)) data = { ...data, id: newId() }
    data = { ...data, updatedAt: Date.now() }
    try {
      await queue(() => projectsDb.save(data))
    } catch {
      setSaveState('error')
      return
    }
    refresh()
    await latest.current.apply(data)
  }

  useEffect(() => {
    if (skipSave.current === session) {
      skipSave.current = null
      return
    }
    if (!latest.current.dirty) return
    const timer = setTimeout(() => {
      // пока ждали, открыли другой проект, эти правки уже не к нему
      if (sessionRef.current !== session) return
      const { project, thumbnail } = latest.current.snapshot()
      queue(async () => {
        try {
          await projectsDb.save({ ...project, thumbnail: await toJpeg(thumbnail) })
          askPersistentStorage()
          if (sessionRef.current === session) setSaveState('saved')
        } catch (err) {
          console.warn('project save failed:', err)
          setSaveState('error')
        }
        refresh()
      })
    }, SAVE_DELAY)
    return () => clearTimeout(timer)
  }, [session, revision, name])

  // при входе показываем список работ и, если не пришли со ссылкой на фон, открываем последнюю
  useEffect(() => {
    if (autoloaded.current) return
    autoloaded.current = true
    projectsDb
      .list()
      .then((list) => {
        setProjects(list)
        if (latest.current.autoload && list[0]) open(list[0].id, true)
      })
      .catch(() => {})
  }, [])

  return {
    session,
    name,
    setName,
    projects,
    saveState,
    error,
    setError,
    adopt,
    newProject,
    open,
    remove,
    exportFile,
    importFile,
  }
}
