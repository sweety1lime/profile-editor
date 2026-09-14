export type CutoutModel = 'quality' | 'fast'

type Reply =
  | { id: number; type: 'progress'; percent: number }
  | { id: number; type: 'running' }
  | { id: number; type: 'done'; bitmap: ImageBitmap }
  | { id: number; type: 'error'; message: string }

type Stage = 'download' | 'run'

interface Pending {
  resolve: (bitmap: ImageBitmap) => void
  reject: (error: Error) => void
  onProgress: (stage: Stage, percent: number) => void
}

let worker: Worker | null = null
let lastId = 0
const pending = new Map<number, Pending>()

// Поток один на всю вкладку: модель в нём остаётся загруженной и второй раз не качается
function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./cutoutWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const reply = e.data
    const task = pending.get(reply.id)
    if (!task) return
    if (reply.type === 'progress') task.onProgress('download', reply.percent)
    else if (reply.type === 'running') task.onProgress('run', 100)
    else {
      pending.delete(reply.id)
      if (reply.type === 'done') task.resolve(reply.bitmap)
      else task.reject(new Error(reply.message))
    }
  }
  worker.onerror = (e) => {
    for (const task of pending.values()) task.reject(new Error(e.message))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

// Возвращает картинку того же размера, где фон стал прозрачным
export function removeBackground(
  blob: Blob,
  model: CutoutModel,
  onProgress: (stage: Stage, percent: number) => void,
): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const id = ++lastId
    pending.set(id, { resolve, reject, onProgress })
    getWorker().postMessage({ id, model, blob })
  })
}
