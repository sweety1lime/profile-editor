import { useTranslation } from 'react-i18next'
import { UPLOAD_LIMIT_BYTES } from '@profile-editor/core'
import { toMegabytes } from '../lib/exportSlices'

// готовые файлы с размером: что не пролезет в лимит загрузки Steam, подсвечено красным
export function FileSizes({ files }: { files: { name: string; blob: Blob }[] }) {
  const { t } = useTranslation()
  return (
    <ul className="space-y-1 text-sm">
      {files.map((f) => (
        <li key={f.name} className="flex justify-between">
          <span className="text-slate-300">{f.name}</span>
          <span className={f.blob.size > UPLOAD_LIMIT_BYTES ? 'text-red-400' : 'text-slate-500'}>
            {t('cutter.export.size', { mb: toMegabytes(f.blob.size) })}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function HexToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <label className="flex items-start gap-2 text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-accent"
      />
      <span>
        {t('cutter.clip.hex')}
        <span className="block text-xs text-slate-500">{t('cutter.clip.hexHint')}</span>
      </span>
    </label>
  )
}
