import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PROFILE_OFFSET_X,
  UPLOAD_LIMIT_BYTES,
  UPLOAD_PAGE,
  UPLOAD_SNIPPETS,
  clampHeight,
  fitFrame,
  isProfileBackground,
  sliceRects,
  zoomFrame,
  type Frame,
  type ShowcaseKind,
} from '@profile-editor/core'
import CropCanvas from '../components/CropCanvas'
import { SourceError, fromFile, fromLink, type SourceImage } from '../lib/source'
import { buildZip, download, renderSlices, toMegabytes, type ExportedFile, type OutFormat } from '../lib/exportSlices'

const KINDS: ShowcaseKind[] = ['artwork', 'featured', 'screenshot', 'workshop']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  )
}

const inputClass =
  'min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent'
const secondaryButton =
  'rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50'
const toggleClass = (active: boolean) =>
  `rounded-lg border px-3 py-2 text-left transition-colors ${
    active ? 'border-accent bg-accent/10 text-white' : 'border-line bg-panel text-slate-300 hover:border-slate-500'
  }`

export default function Cutter() {
  const { t } = useTranslation()
  const [source, setSource] = useState<SourceImage | null>(null)
  const [kind, setKind] = useState<ShowcaseKind>('artwork')
  const [frame, setFrame] = useState<Frame | null>(null)
  const [format, setFormat] = useState<OutFormat>('png')
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<ExportedFile[] | null>(null)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // старую картинку освобождаем, когда пришла новая
  useEffect(() => {
    return () => {
      if (source?.image instanceof ImageBitmap) source.image.close()
    }
  }, [source])

  async function load(task: () => Promise<SourceImage>) {
    setLoading(true)
    setError(null)
    try {
      const next = await task()
      setSource(next)
      setFrame(fitFrame(kind, next.width, next.height))
      setFiles(null)
    } catch (err) {
      setError(err instanceof SourceError ? err.code : 'load_failed')
    } finally {
      setLoading(false)
    }
  }

  const onFile = (file?: File | null) => {
    if (file) load(() => fromFile(file))
  }

  function onLinkSubmit(e: FormEvent) {
    e.preventDefault()
    if (link.trim()) load(() => fromLink(link))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    onFile(e.dataTransfer.files[0])
  }

  function changeKind(next: ShowcaseKind) {
    setKind(next)
    setFiles(null)
    if (!source || !frame) return
    setFrame(
      isProfileBackground(source.width)
        ? { ...frame, x: PROFILE_OFFSET_X[next] }
        : { ...fitFrame(next, source.width, source.height), y: frame.y },
    )
  }

  function changeFrame(next: Frame) {
    setFrame(next)
    setFiles(null)
  }

  function readme() {
    const lines = [t('cutter.readme', { kind: t(`cutter.kind.${kind}`) }), '']
    lines.push(t('cutter.upload.step1', { url: UPLOAD_PAGE }), t('cutter.upload.step2'), t('cutter.upload.step3'))
    lines.push('', UPLOAD_SNIPPETS[kind], '')
    lines.push(t(kind === 'workshop' ? 'cutter.upload.workshopNote' : 'cutter.upload.note'))
    return lines.join('\n')
  }

  async function onExport() {
    if (!source || !frame) return
    setExporting(true)
    try {
      const out = await renderSlices(source.image, sliceRects(kind, frame), format)
      setFiles(out)
      download(await buildZip(out, readme()), `${kind}.zip`)
    } finally {
      setExporting(false)
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(UPLOAD_SNIPPETS[kind])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const zoom = frame ? Math.round(100 / frame.scale) : 100
  const tooBig = files?.some((f) => f.blob.size > UPLOAD_LIMIT_BYTES)

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-6">
        <h1 className="text-2xl font-semibold text-white">{t('cutter.title')}</h1>

        <Section title={t('cutter.source.title')}>
          <button type="button" onClick={() => fileInput.current?.click()} className={`${secondaryButton} w-full`}>
            {t('cutter.source.file')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <form onSubmit={onLinkSubmit} className="mt-3 flex gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={t('cutter.source.linkPlaceholder')}
              className={inputClass}
            />
            <button type="submit" disabled={!link.trim() || loading} className={secondaryButton}>
              {loading ? '…' : t('cutter.source.load')}
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500">{t('cutter.source.linkHint')}</p>
          {error && <p className="mt-2 text-sm text-red-400">{t(`cutter.errors.${error}`)}</p>}
          {source && /\.gif$/i.test(source.name) && (
            <p className="mt-2 text-xs text-amber-300/80">{t('cutter.source.gifNote')}</p>
          )}
        </Section>

        <Section title={t('cutter.kind.title')}>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button key={k} type="button" onClick={() => changeKind(k)} className={toggleClass(k === kind)}>
                <div className="text-sm font-medium">{t(`cutter.kind.${k}`)}</div>
                <div className="text-xs text-slate-500">{t(`cutter.kind.${k}Size`)}</div>
              </button>
            ))}
          </div>
          {kind === 'workshop' && <p className="mt-2 text-xs text-amber-300/80">{t('cutter.kind.workshopNote')}</p>}
        </Section>

        {source && frame && (
          <Section title={t('cutter.frame.title')}>
            <div className="space-y-3 text-sm">
              <label className="block">
                <div className="mb-1 flex justify-between text-slate-400">
                  <span>{t('cutter.frame.height')}</span>
                  <input
                    type="number"
                    value={frame.height}
                    min={50}
                    max={4000}
                    onChange={(e) => changeFrame({ ...frame, height: clampHeight(Number(e.target.value) || 0) })}
                    className="w-20 rounded border border-line bg-panel px-2 py-0.5 text-right text-white"
                  />
                </div>
                <input
                  type="range"
                  min={50}
                  max={3000}
                  value={frame.height}
                  onChange={(e) => changeFrame({ ...frame, height: Number(e.target.value) })}
                  className="w-full accent-accent"
                />
              </label>
              <label className="block">
                <div className="mb-1 flex justify-between text-slate-400">
                  <span>{t('cutter.frame.zoom')}</span>
                  <span className="text-white">{zoom}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={400}
                  value={zoom}
                  onChange={(e) => changeFrame(zoomFrame(kind, frame, 100 / Number(e.target.value)))}
                  className="w-full accent-accent"
                />
              </label>
              <div className="flex gap-2">
                {isProfileBackground(source.width) && (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => changeFrame({ ...frame, x: PROFILE_OFFSET_X[kind], scale: 1 })}
                  >
                    {t('cutter.frame.alignProfile')}
                  </button>
                )}
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => changeFrame({ ...fitFrame(kind, source.width, source.height), y: frame.y })}
                >
                  {t('cutter.frame.fitWidth')}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {t('cutter.frame.position', { x: frame.x, y: frame.y })} · {t('cutter.frame.hint')}
              </p>
            </div>
          </Section>
        )}

        <Section title={t('cutter.format.title')}>
          <div className="flex gap-2">
            {(['png', 'jpg'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFormat(f)} className={toggleClass(f === format)}>
                <span className="text-sm uppercase">{f}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('cutter.format.hint')}</p>
        </Section>

        <button
          type="button"
          onClick={onExport}
          disabled={!source || !frame || exporting}
          className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-ink disabled:opacity-50"
        >
          {exporting ? t('cutter.export.working') : t('cutter.export.button')}
        </button>

        {files && (
          <div className="space-y-2">
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
            {tooBig && <p className="text-sm text-red-400">{t('cutter.export.tooBig')}</p>}
          </div>
        )}

        <details open={!!files} className="rounded-lg border border-line bg-panel p-4 text-sm">
          <summary className="cursor-pointer text-slate-300">{t('cutter.upload.title')}</summary>
          <div className="mt-3 space-y-2 text-slate-400">
            <p>
              {t('cutter.upload.step1', { url: '' })}
              <a href={UPLOAD_PAGE} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">
                {UPLOAD_PAGE}
              </a>
            </p>
            <p>{t('cutter.upload.step2')}</p>
            <p>{t('cutter.upload.step3')}</p>
            <pre className="overflow-x-auto rounded bg-ink p-2 text-xs text-slate-300">{UPLOAD_SNIPPETS[kind]}</pre>
            <button type="button" onClick={copyCode} className={secondaryButton}>
              {copied ? t('cutter.upload.copied') : t('cutter.upload.copy')}
            </button>
            <p className="text-xs text-slate-500">
              {t(kind === 'workshop' ? 'cutter.upload.workshopNote' : 'cutter.upload.note')}
            </p>
          </div>
        </details>
      </aside>

      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="relative h-[calc(100vh-9rem)] min-h-[480px] overflow-hidden rounded-xl border border-line bg-panel/40"
      >
        {source && frame ? (
          <CropCanvas
            image={source.image}
            imageWidth={source.width}
            imageHeight={source.height}
            kind={kind}
            frame={frame}
            onChange={changeFrame}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-lg text-white">{t('cutter.empty.title')}</p>
            <p className="max-w-sm text-sm text-slate-500">{t('cutter.empty.text')}</p>
          </div>
        )}
      </section>
    </div>
  )
}
