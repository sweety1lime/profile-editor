import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { kitFrame, kitSlots, type KitItem, type KitPlacement, type Timeline } from '@profile-editor/core'
import { buildZip, download, type OutFormat } from './exportSlices'
import { TooBigError, cutShowcases, groupFiles, type CutProgress, type ShowcaseGroup } from './cutShowcases'
import { uploadReadme } from './readme'
import { useBusyLabel } from './useBusyLabel'
import type { Source } from './source'

// Сборка комплекта: одну и ту же картинку режем по каждой витрине подряд, в тех местах,
// где витрина стоит на странице профиля

interface Options {
  source: Source | null
  items: KitItem[]
  placement: KitPlacement
  timeline: Timeline | null
  format: OutFormat
  hex: boolean
}

export function useKitExport({ source, items, placement, timeline, format, hex }: Options) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<CutProgress | null>(null)
  const [groups, setGroups] = useState<ShowcaseGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setGroups(null)
    setError(null)
  }

  async function run() {
    if (!source || !items.length) return
    setError(null)
    try {
      const done = await cutShowcases({
        slots: kitSlots(items).map((slot) => ({ id: slot.id, kind: slot.kind, frame: kitFrame(slot, placement) })),
        still: source.type === 'still' ? source.image : null,
        animated: source.type === 'animated' && timeline ? { source, timeline } : null,
        format,
        hex,
        onProgress: setBusy,
      })
      setGroups(done)
      download(await buildZip(groupFiles(done), uploadReadme(t, items.map((item) => item.kind))), 'kit.zip')
    } catch (err) {
      setError(err instanceof TooBigError ? 'animTooBig' : 'failed')
    } finally {
      setBusy(null)
    }
  }

  return { busy, label: useBusyLabel(busy), groups, error, reset, run }
}
