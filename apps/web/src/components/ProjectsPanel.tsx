import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjectRecord } from '../lib/projectsDb'
import { useObjectUrl } from '../lib/useObjectUrl'
import { Section, inputClass, secondaryButton } from './controls'

interface Props {
  projects: ProjectRecord[]
  currentId: string
  name: string
  placeholder: string
  status: 'idle' | 'saved' | 'error'
  error: 'import' | 'open' | null
  canExport: boolean
  onName: (name: string) => void
  onOpen: (project: ProjectRecord) => void
  onDelete: (project: ProjectRecord) => void
  onNew: () => void
  onExport: () => void
  onImport: (file: File) => void
}

function ProjectRow(props: { project: ProjectRecord; current: boolean; onOpen: () => void; onDelete: () => void }) {
  const { t, i18n } = useTranslation()
  const thumb = useObjectUrl(props.project.thumbnail)
  const date = new Date(props.project.updatedAt).toLocaleString(i18n.language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <li
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
        props.current ? 'border-accent bg-accent/10' : 'border-line bg-panel'
      }`}
    >
      <button type="button" onClick={props.onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {thumb ? (
          <img src={thumb} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded bg-ink" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-slate-200">{props.project.name}</span>
          <span className="block text-xs text-slate-500">
            {date}
            {props.current && ` · ${t('builder.projects.current')}`}
          </span>
        </span>
      </button>
      <button
        type="button"
        title={t('builder.projects.delete')}
        aria-label={t('builder.projects.delete')}
        onClick={props.onDelete}
        className="px-1 text-slate-400 hover:text-red-400"
      >
        ✕
      </button>
    </li>
  )
}

export default function ProjectsPanel(props: Props) {
  const { t } = useTranslation()
  const fileInput = useRef<HTMLInputElement>(null)

  let status = t('builder.projects.hint')
  if (props.status === 'saved') status = t('builder.projects.saved')
  if (props.status === 'error') status = t('builder.projects.saveError')

  return (
    <Section title={t('builder.projects.title')}>
      <div data-projects-panel>
        <input
          value={props.name}
          onChange={(e) => props.onName(e.target.value)}
          placeholder={props.placeholder}
          aria-label={t('builder.projects.name')}
          className={inputClass}
        />
        <p className={`mt-1 text-xs ${props.status === 'error' ? 'text-red-400' : 'text-slate-500'}`} data-save-status={props.status}>
          {status}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={props.onNew} className={secondaryButton}>
            {t('builder.projects.new')}
          </button>
          <button type="button" onClick={props.onExport} disabled={!props.canExport} className={secondaryButton}>
            {t('builder.projects.export')}
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} className={secondaryButton}>
            {t('builder.projects.import')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) props.onImport(file)
              e.target.value = ''
            }}
          />
        </div>
        {props.error && <p className="mt-2 text-xs text-red-400">{t(`builder.projects.errors.${props.error}`)}</p>}
        {props.projects.length > 0 && (
          <ul className="mt-3 max-h-60 space-y-1 overflow-auto" data-projects>
            {props.projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                current={project.id === props.currentId}
                onOpen={() => props.onOpen(project)}
                onDelete={() => props.onDelete(project)}
              />
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
