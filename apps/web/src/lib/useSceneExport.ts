import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  UPLOAD_PAGE,
  UPLOAD_SNIPPETS,
  UPLOAD_LIMIT_BYTES,
  buildTimeline,
  sliceRects,
  type Frame,
} from '@profile-editor/core'
import { drawScene, sceneSource, sceneWidth, type Scene, type SceneBackground } from './compose'
import { buildZip, download, renderSlices, type ExportedFile, type OutFormat } from './exportSlices'
import type { Progress } from './encodeGif'
import type { Source } from './source'

// Сборка витрины из сцены конструктора: картинки — сразу, анимация — через кодировщик гифок

export type Busy = Progress | { stage: 'still' }

export interface ExportResult {
  files: ExportedFile[]
  frames?: number
  thinned?: boolean
}

interface Options {
  scene: Scene
  // фон, как он виден на холсте
  background: SceneBackground | null
  assets: Map<string, ImageBitmap>
  // исходник фона: у гифки кадры берём из него, а не из застывшего постера
  source: Source | null
  frame: Frame | null
  format: OutFormat
  hex: boolean
  animated: boolean
}

export function useSceneExport(options: Options) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<Busy | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { scene, background, assets, source, frame, format, hex, animated } = options
  const { kind, height } = scene

  function reset() {
    setResult(null)
    setError(null)
  }

  function readme() {
    const lines = [t('cutter.readme', { kind: t(`cutter.kind.${kind}`) }), '']
    lines.push(t('cutter.upload.step1', { url: UPLOAD_PAGE }), t('cutter.upload.step2'), t('cutter.upload.step3'))
    lines.push('', UPLOAD_SNIPPETS[kind], '')
    lines.push(t(kind === 'workshop' ? 'cutter.upload.workshopNote' : 'cutter.upload.note'))
    return lines.join('\n')
  }

  async function run() {
    setError(null)
    // сцена уже нарисована в размер витрины, поэтому режем её без сдвига и без масштаба
    const sliceFrame: Frame = { x: 0, y: 0, scale: 1, height }
    try {
      let next: ExportResult
      if (!animated) {
        setBusy({ stage: 'still' })
        const canvas = document.createElement('canvas')
        canvas.width = sceneWidth(kind)
        canvas.height = height
        drawScene(canvas.getContext('2d')!, scene, 0, background, assets)
        next = { files: await renderSlices(canvas, sliceRects(kind, sliceFrame), format) }
      } else {
        const { encodeAnimated } = await import('./encodeGif')
        const timeline = buildTimeline(0, scene.durationMs / 1000, scene.fps)
        const backgroundSource = source && frame ? { source, frame: { ...frame, height } } : null
        const encoded = await encodeAnimated(
          sceneSource(scene, backgroundSource, assets),
          kind,
          sliceFrame,
          timeline,
          { limit: UPLOAD_LIMIT_BYTES, hex },
          setBusy,
        )
        if (!encoded) {
          setError('animTooBig')
          return
        }
        next = {
          files: encoded.parts.map((part) => ({
            name: `${part.name}.gif`,
            blob: new Blob([part.bytes as BlobPart], { type: 'image/gif' }),
          })),
          frames: encoded.frameCount,
          thinned: encoded.step > 1,
        }
      }
      setResult(next)
      download(await buildZip(next.files, readme()), `${kind}.zip`)
    } catch {
      setError('failed')
    } finally {
      setBusy(null)
    }
  }

  let label: string | null = null
  if (busy?.stage === 'still') label = t('cutter.export.working')
  else if (busy?.stage === 'frames') label = t('cutter.export.frames', { done: busy.done, total: busy.total })
  else if (busy?.stage === 'encode') label = t(busy.attempt > 1 ? 'cutter.export.thinning' : 'cutter.export.encoding')

  return { busy, label, result, error, reset, run }
}
