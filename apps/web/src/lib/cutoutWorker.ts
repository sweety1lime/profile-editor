import { AutoModel, AutoProcessor, env, pipeline, RawImage, type Tensor } from '@huggingface/transformers'

// Вырезка фона в отдельном потоке, чтобы страница не подвисала, пока работает модель

type Model = 'quality' | 'fast'
type Request = { id: number; model: Model; blob: Blob }
// принимает картинку и отдаёт холст той же картинки с прозрачным фоном
type Cutter = (image: RawImage) => Promise<OffscreenCanvas>
type Progress = (percent: number) => void

// модели берём только с Hugging Face, у себя на сайте мы их не храним
env.allowLocalModels = false

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const progressOption = (onProgress: Progress) => ({
  progress_callback: (info: { status: string; progress?: number }) => {
    if (info.status === 'progress_total' && info.progress !== undefined) onProgress(info.progress)
  },
})

// MODNet понимает готовый конвейер background-removal
async function loadModnet(onProgress: Progress): Promise<Cutter> {
  const segmenter = (await pipeline('background-removal', 'Xenova/modnet', {
    dtype: 'q8',
    device: 'wasm',
    ...progressOption(onProgress),
  })) as unknown as (image: RawImage) => Promise<RawImage>
  return async (image) => (await segmenter(image)).toCanvas() as OffscreenCanvas
}

// RMBG-1.4 конвейер не знает, поэтому запускаем её вручную, как в карточке модели:
// модель выдаёт маску 1024×1024, растягиваем её до размера картинки и ставим как прозрачность
async function loadRmbg(onProgress: Progress): Promise<Cutter> {
  const [model, processor] = await Promise.all([
    AutoModel.from_pretrained('briaai/RMBG-1.4', {
      config: { model_type: 'custom' } as never,
      dtype: 'q8',
      device: 'wasm',
      ...progressOption(onProgress),
    }),
    AutoProcessor.from_pretrained('briaai/RMBG-1.4'),
  ])
  return async (image) => {
    const { pixel_values } = await processor(image)
    const { output } = (await model({ input: pixel_values })) as { output: Tensor }
    const first = (output as unknown as Tensor[])[0]!
    const mask = await RawImage.fromTensor(first.mul(255).to('uint8')).resize(image.width, image.height)

    const canvas = image.toCanvas() as OffscreenCanvas
    const ctx = canvas.getContext('2d')!
    const pixels = ctx.getImageData(0, 0, image.width, image.height)
    for (let i = 0; i < mask.data.length; i++) pixels.data[i * 4 + 3] = mask.data[i]!
    ctx.putImageData(pixels, 0, 0)
    return canvas
  }
}

const loaded = new Map<Model, Promise<Cutter>>()

function load(model: Model, onProgress: Progress): Promise<Cutter> {
  let promise = loaded.get(model)
  if (!promise) {
    promise = model === 'quality' ? loadRmbg(onProgress) : loadModnet(onProgress)
    // если загрузка сорвалась, в следующий раз пробуем заново
    promise.catch(() => loaded.delete(model))
    loaded.set(model, promise)
  }
  return promise
}

scope.onmessage = async (e) => {
  const { id, model, blob } = e.data
  try {
    const cut = await load(model, (percent) => scope.postMessage({ id, type: 'progress', percent }))
    scope.postMessage({ id, type: 'running' })
    const canvas = await cut(await RawImage.fromBlob(blob))
    // если модель не нашла объект, картинка выйдет почти целиком прозрачной, такое не отдаём
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    let visible = 0
    for (let i = 3; i < data.length; i += 16) if (data[i]! > 128) visible++
    if (visible < (data.length / 16) * 0.01) {
      scope.postMessage({ id, type: 'error', message: 'empty' })
      return
    }
    const bitmap = canvas.transferToImageBitmap()
    scope.postMessage({ id, type: 'done', bitmap }, [bitmap])
  } catch (err) {
    scope.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
