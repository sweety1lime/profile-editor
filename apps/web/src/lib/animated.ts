import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import { decompressFrames, parseGIF } from 'gifuct-js'

export interface AnimatedSource {
  type: 'animated'
  name: string
  width: number
  height: number
  duration: number
  fps: number
  poster: CanvasImageSource
  blob: Blob
  frames(timestamps: number[]): AsyncGenerator<CanvasImageSource>
  dispose(): void
}

interface GifFrame {
  image: ImageBitmap
  end: number
}

const MAX_GIF_FRAMES = 500

// Как и браузеры, считаем слишком короткие задержки за 100 мс
const normalizeDelay = (ms: number) => (ms < 20 ? 100 : ms)

function gifSource(list: GifFrame[], name: string, blob: Blob): AnimatedSource {
  const first = list[0]!
  const duration = list[list.length - 1]!.end
  return {
    type: 'animated',
    name,
    blob,
    width: first.image.width,
    height: first.image.height,
    duration,
    fps: list.length / duration,
    poster: first.image,
    async *frames(timestamps) {
      for (const t of timestamps) {
        const local = t % duration
        yield (list.find((f) => local < f.end) ?? first).image
      }
    },
    dispose() {
      for (const f of list) f.image.close()
    },
  }
}

async function decodeNative(data: ArrayBuffer): Promise<GifFrame[]> {
  const decoder = new ImageDecoder({ data, type: 'image/gif' })
  try {
    await decoder.tracks.ready
    const count = Math.min(decoder.tracks.selectedTrack?.frameCount ?? 1, MAX_GIF_FRAMES)
    const list: GifFrame[] = []
    let time = 0
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i })
      time += normalizeDelay((image.duration ?? 0) / 1000) / 1000
      list.push({ image: await createImageBitmap(image), end: time })
      image.close()
    }
    return list
  } finally {
    decoder.close()
  }
}

// Для Safari, где нет ImageDecoder: собираем кадры сами с учётом способа очистки
async function decodeFallback(data: ArrayBuffer): Promise<GifFrame[]> {
  const gif = parseGIF(data)
  const parsed = decompressFrames(gif, true).slice(0, MAX_GIF_FRAMES)
  const canvas = new OffscreenCanvas(gif.lsd.width, gif.lsd.height)
  const ctx = canvas.getContext('2d')!
  const patch = new OffscreenCanvas(1, 1)
  const patchCtx = patch.getContext('2d')!
  const list: GifFrame[] = []
  let time = 0

  for (const frame of parsed) {
    const { width, height, left, top } = frame.dims
    const previous = frame.disposalType === 3 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null
    patch.width = width
    patch.height = height
    patchCtx.putImageData(new ImageData(frame.patch as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0)
    ctx.drawImage(patch, left, top)

    time += normalizeDelay(frame.delay) / 1000
    list.push({ image: await createImageBitmap(canvas), end: time })

    if (frame.disposalType === 2) ctx.clearRect(left, top, width, height)
    else if (previous) ctx.putImageData(previous, 0, 0)
  }
  return list
}

// Возвращает null, если в гифке один кадр: тогда это обычная картинка
export async function openGif(blob: Blob, name: string): Promise<AnimatedSource | null> {
  const data = await blob.arrayBuffer()
  const native = typeof ImageDecoder !== 'undefined' && (await ImageDecoder.isTypeSupported('image/gif'))
  const list = native ? await decodeNative(data) : await decodeFallback(data)
  if (list.length < 2) {
    for (const f of list) f.image.close()
    return null
  }
  return gifSource(list, name, blob)
}

export async function openVideo(blob: Blob, name: string): Promise<AnimatedSource> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('no video track')
    if (!(await track.canDecode())) throw new Error(`codec not supported: ${await track.getCodecParameterString()}`)

    const [width, height, duration] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration(),
    ])
    const sink = new CanvasSink(track, { poolSize: 2 })

    // первый кадр копируем отдельно, канвасы из пула переиспользуются
    const iterator = sink.canvases()
    const firstFrame = (await iterator.next()).value
    await iterator.return()
    if (!firstFrame) throw new Error('empty video')
    const poster = document.createElement('canvas')
    poster.width = width
    poster.height = height
    poster.getContext('2d')!.drawImage(firstFrame.canvas, 0, 0, width, height)

    return {
      type: 'animated',
      name,
      blob,
      width,
      height,
      duration,
      fps: 15,
      poster,
      async *frames(timestamps) {
        for await (const wrapped of sink.canvasesAtTimestamps(timestamps.map((t) => t % duration))) {
          yield wrapped?.canvas ?? poster
        }
      },
      dispose() {
        input.dispose()
      },
    }
  } catch (err) {
    input.dispose()
    throw err
  }
}
