import { useTranslation } from 'react-i18next'
import type { CutProgress } from './cutShowcases'

// Подпись на кнопке, пока идёт сборка: что именно считаем и какая по счёту витрина
export function useBusyLabel(busy: CutProgress | null): string | null {
  const { t } = useTranslation()
  if (!busy) return null
  let stage: string
  if (busy.stage === 'still') stage = t('cutter.export.working')
  else if (busy.stage === 'frames') stage = t('cutter.export.frames', { done: busy.done, total: busy.total })
  else stage = t(busy.attempt > 1 ? 'cutter.export.thinning' : 'cutter.export.encoding')
  if (busy.showcases < 2) return stage
  return `${stage} · ${t('kit.export.showcase', { done: busy.showcase, total: busy.showcases })}`
}
