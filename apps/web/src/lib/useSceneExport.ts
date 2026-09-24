import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildTimeline, slotFrame, type Frame } from '@profile-editor/core'
import { drawScene, sceneSource, type Scene, type SceneBackground } from './compose'
import { buildZip, download, type OutFormat } from './exportSlices'
import { TooBigError, cutShowcases, groupFiles, type CutProgress, type ShowcaseGroup } from './cutShowcases'
import { uploadReadme } from './readme'
import { useBusyLabel } from './useBusyLabel'
import type { Source } from './source'

// Сборка сцены конструктора: картинки — сразу, анимация — через кодировщик гифок.
// Сцена уже нарисована в размер холста, поэтому витрины режем из неё без сдвига и без масштаба

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
  const [busy, setBusy] = useState<CutProgress | null>(null)
  const [groups, setGroups] = useState<ShowcaseGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { scene, background, assets, source, frame, format, hex, animated } = options
  const { box } = scene

  function reset() {
    setGroups(null)
    setError(null)
  }

  async function run() {
    setError(null)
    const slots = box.slots.map((slot) => ({ id: slot.id, kind: slot.kind, frame: slotFrame(slot) }))
    try {
      let still: HTMLCanvasElement | null = null
      let clip: Parameters<typeof cutShowcases>[0]['animated'] = null
      if (animated) {
        const backgroundSource = source && frame ? { source, frame: { ...frame, height: box.height } } : null
        clip = {
          source: sceneSource(scene, backgroundSource, assets),
          timeline: buildTimeline(0, scene.durationMs / 1000, scene.fps),
        }
      } else {
        still = document.createElement('canvas')
        still.width = box.width
        still.height = box.height
        drawScene(still.getContext('2d')!, scene, 0, background, assets)
      }
      const done = await cutShowcases({ slots, still, animated: clip, format, hex, onProgress: setBusy })
      setGroups(done)
      const name = done.length > 1 ? 'kit' : (done[0]?.kind ?? 'showcase')
      download(await buildZip(groupFiles(done), uploadReadme(t, slots.map((slot) => slot.kind))), `${name}.zip`)
    } catch (err) {
      setError(err instanceof TooBigError ? 'animTooBig' : 'failed')
    } finally {
      setBusy(null)
    }
  }

  return { busy, label: useBusyLabel(busy), groups, error, reset, run }
}
