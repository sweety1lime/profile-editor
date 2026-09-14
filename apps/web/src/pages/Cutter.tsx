import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  FPS_OPTIONS,
  MAX_CLIP_SECONDS,
  PROFILE_OFFSET,
  UPLOAD_LIMIT_BYTES,
  UPLOAD_PAGE,
  UPLOAD_SNIPPETS,
  buildTimeline,
  clampHeight,
  fitFrame,
  isProfileBackground,
  nearestFps,
  sliceRects,
  zoomFrame,
  type Frame,
  type ShowcaseKind,
} from '@profile-editor/core'
import CopyButton from '../components/CopyButton'
import CropCanvas from '../components/CropCanvas'
import ShowcasePreview from '../components/ShowcasePreview'
import { showcaseStore } from '../lib/showcaseStore'
import { SourceError, disposeSource, fromFile, fromLink, type Source } from '../lib/source'
import { buildZip, download, renderSlices, toMegabytes, type ExportedFile, type OutFormat } from '../lib/exportSlices'
import type { Progress } from '../lib/encodeGif'

const KINDS: ShowcaseKind[] = ['artwork', 'featured', 'screenshot', 'workshop']
const DEFAULT_CLIP_SECONDS = 5
const MIN_CLIP_SECONDS = 0.2

interface Clip {
  start: number
  length: number
  fps: number
}

interface Result {
  files: ExportedFile[]
  frames?: number
  fps?: number
  thinned?: boolean
}

type Busy = Progress | { stage: 'still' }

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  )
}

function RangeRow(props: {
  label: string
  display: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-slate-400">
        <span>{props.label}</span>
        <span className="text-white">{props.display}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </label>
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
  const [source, setSource] = useState<Source | null>(null)
  const [kind, setKind] = useState<ShowcaseKind>('artwork')
  const [frame, setFrame] = useState<Frame | null>(null)
  const [clip, setClip] = useState<Clip | null>(null)
  const [hex, setHex] = useState(false)
  const [format, setFormat] = useState<OutFormat>('png')
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [tab, setTab] = useState<'edit' | 'result'>('edit')
  const navigate = useNavigate()
  const { lang } = useParams()
  const fileInput = useRef<HTMLInputElement>(null)

  // старый исходник освобождаем, когда пришёл новый
  useEffect(() => {
    return () => {
      if (source) disposeSource(source)
    }
  }, [source])

  // из каталога приходим со ссылкой на фон в адресе
  const [searchParams] = useSearchParams()
  const src = searchParams.get('src')
  useEffect(() => {
    if (!src) return
    setLink(src)
    load(() => fromLink(src))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  function resetResult() {
    setResult(null)
    setTab('edit')
    setExportError(null)
  }

  async function load(task: () => Promise<Source>) {
    setLoading(true)
    setError(null)
    try {
      const next = await task()
      setSource(next)
      setFrame(fitFrame(kind, next.width, next.height))
      setClip(
        next.type === 'animated'
          ? { start: 0, length: Math.min(next.duration, DEFAULT_CLIP_SECONDS), fps: nearestFps(next.fps) }
          : null,
      )
      resetResult()
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
    setHex(next === 'workshop')
    resetResult()
    if (!source || !frame) return
    setFrame(
      isProfileBackground(source.width)
        ? { ...frame, x: PROFILE_OFFSET[next].x }
        : { ...fitFrame(next, source.width, source.height), y: frame.y },
    )
  }

  function changeFrame(next: Frame) {
    setFrame(next)
    resetResult()
  }

  function changeClip(patch: Partial<Clip>) {
    if (!clip || source?.type !== 'animated') return
    const next = { ...clip, ...patch }
    const maxLength = Math.max(MIN_CLIP_SECONDS, Math.min(MAX_CLIP_SECONDS, source.duration - next.start))
    next.length = Math.min(Math.max(next.length, MIN_CLIP_SECONDS), maxLength)
    setClip(next)
    resetResult()
  }

  const timeline = clip ? buildTimeline(clip.start, clip.length, clip.fps) : null

  function readme() {
    const lines = [t('cutter.readme', { kind: t(`cutter.kind.${kind}`) }), '']
    lines.push(t('cutter.upload.step1', { url: UPLOAD_PAGE }), t('cutter.upload.step2'), t('cutter.upload.step3'))
    lines.push('', UPLOAD_SNIPPETS[kind], '')
    lines.push(t(kind === 'workshop' ? 'cutter.upload.workshopNote' : 'cutter.upload.note'))
    return lines.join('\n')
  }

  async function onExport() {
    if (!source || !frame) return
    setExportError(null)
    try {
      let next: Result
      if (source.type === 'still') {
        setBusy({ stage: 'still' })
        next = { files: await renderSlices(source.image, sliceRects(kind, frame), format) }
      } else {
        if (!timeline) return
        const { encodeAnimated } = await import('../lib/encodeGif')
        const encoded = await encodeAnimated(source, kind, frame, timeline, { limit: UPLOAD_LIMIT_BYTES, hex }, setBusy)
        if (!encoded) {
          setExportError('animTooBig')
          return
        }
        next = {
          files: encoded.parts.map((part) => ({
            name: `${part.name}.gif`,
            blob: new Blob([part.bytes as BlobPart], { type: 'image/gif' }),
          })),
          frames: encoded.frameCount,
          fps: Math.round(100 / (encoded.delays[0] ?? 10)),
          thinned: encoded.step > 1,
        }
      }
      setResult(next)
      setTab('result')
      download(await buildZip(next.files, readme()), `${kind}.zip`)
    } catch {
      setExportError('failed')
    } finally {
      setBusy(null)
    }
  }

  // Отдаём готовые части в превью, а если резали фон профиля, то и сам фон
  function sendToPreview() {
    if (!result || !source) return
    showcaseStore.addShowcase(kind, result.files)
    if (isProfileBackground(source.width)) {
      showcaseStore.setBackground({ blob: source.blob, isVideo: source.blob.type.startsWith('video/') })
    }
    navigate(`/${lang}/preview`)
  }

  const poster = source ? (source.type === 'still' ? source.image : source.poster) : null
  const zoom = frame ? Math.round(100 / frame.scale) : 100
  const tooBig = result?.files.some((f) => f.blob.size > UPLOAD_LIMIT_BYTES)
  const seconds = (s: number) => t('cutter.clip.seconds', { s: s.toFixed(1) })

  let busyLabel: string | null = null
  if (busy?.stage === 'still') busyLabel = t('cutter.export.working')
  else if (busy?.stage === 'frames') busyLabel = t('cutter.export.frames', { done: busy.done, total: busy.total })
  else if (busy?.stage === 'encode') busyLabel = t(busy.attempt > 1 ? 'cutter.export.thinning' : 'cutter.export.encoding')

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
            accept="image/*,video/*"
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
              <RangeRow
                label={t('cutter.frame.zoom')}
                display={`${zoom}%`}
                value={zoom}
                min={5}
                max={400}
                onChange={(value) => changeFrame(zoomFrame(kind, frame, 100 / value))}
              />
              <div className="flex gap-2">
                {isProfileBackground(source.width) && (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => changeFrame({ ...frame, ...PROFILE_OFFSET[kind], scale: 1 })}
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

        {source?.type === 'animated' && clip && timeline && (
          <Section title={t('cutter.clip.title')}>
            <div className="space-y-3 text-sm">
              <RangeRow
                label={t('cutter.clip.start')}
                display={seconds(clip.start)}
                value={clip.start}
                min={0}
                max={Math.max(0, source.duration - MIN_CLIP_SECONDS)}
                step={0.1}
                onChange={(start) => changeClip({ start })}
              />
              <RangeRow
                label={t('cutter.clip.length')}
                display={seconds(clip.length)}
                value={clip.length}
                min={MIN_CLIP_SECONDS}
                max={Math.max(MIN_CLIP_SECONDS, Math.min(MAX_CLIP_SECONDS, source.duration - clip.start))}
                step={0.1}
                onChange={(length) => changeClip({ length })}
              />
              <div>
                <div className="mb-1 text-slate-400">{t('cutter.clip.fps')}</div>
                <div className="flex gap-1">
                  {FPS_OPTIONS.map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => changeClip({ fps })}
                      className={`flex-1 rounded-md border px-2 py-1 text-center ${
                        fps === clip.fps ? 'border-accent bg-accent/10 text-white' : 'border-line text-slate-400'
                      }`}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500">{t('cutter.clip.frames', { count: timeline.timestamps.length })}</p>
              <label className="flex items-start gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={hex}
                  onChange={(e) => {
                    setHex(e.target.checked)
                    resetResult()
                  }}
                  className="mt-1 accent-accent"
                />
                <span>
                  {t('cutter.clip.hex')}
                  <span className="block text-xs text-slate-500">{t('cutter.clip.hexHint')}</span>
                </span>
              </label>
            </div>
          </Section>
        )}

        {source?.type !== 'animated' && (
          <Section title={t('cutter.format.title')}>
            <div className="flex gap-2">
              {(['png', 'jpg'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFormat(f)
                    resetResult()
                  }}
                  className={toggleClass(f === format)}
                >
                  <span className="text-sm uppercase">{f}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">{t('cutter.format.hint')}</p>
          </Section>
        )}

        <button
          type="button"
          onClick={onExport}
          disabled={!source || !frame || !!busy}
          className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-ink disabled:opacity-50"
        >
          {busyLabel ?? t(source?.type === 'animated' ? 'cutter.export.gifButton' : 'cutter.export.button')}
        </button>

        {exportError && <p className="text-sm text-red-400">{t(`cutter.export.${exportError}`)}</p>}

        {result && (
          <div className="space-y-2">
            <ul className="space-y-1 text-sm">
              {result.files.map((f) => (
                <li key={f.name} className="flex justify-between">
                  <span className="text-slate-300">{f.name}</span>
                  <span className={f.blob.size > UPLOAD_LIMIT_BYTES ? 'text-red-400' : 'text-slate-500'}>
                    {t('cutter.export.size', { mb: toMegabytes(f.blob.size) })}
                  </span>
                </li>
              ))}
            </ul>
            {result.frames ? (
              <p className="text-xs text-slate-500">{t('cutter.result.info', { frames: result.frames, fps: result.fps })}</p>
            ) : null}
            {result.thinned && <p className="text-xs text-amber-300/80">{t('cutter.result.thinned')}</p>}
            {tooBig && <p className="text-sm text-red-400">{t('cutter.export.tooBig')}</p>}
            <button type="button" onClick={sendToPreview} className={`${secondaryButton} w-full`}>
              {t('cutter.result.toPreview')}
            </button>
          </div>
        )}

        <details open={!!result} className="rounded-lg border border-line bg-panel p-4 text-sm">
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
            <CopyButton text={UPLOAD_SNIPPETS[kind]} />
            <p className="text-xs text-slate-500">
              {t(kind === 'workshop' ? 'cutter.upload.workshopNote' : 'cutter.upload.note')}
            </p>
          </div>
        </details>
      </aside>

      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="relative h-[calc(100vh-9rem)] min-h-[480px] overflow-hidden rounded-xl border border-line bg-panel/40 lg:sticky lg:top-4 lg:self-start"
      >
        {result && (
          <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-lg bg-ink/80 p-1 text-sm">
            {(['edit', 'result'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTab(v)}
                className={`rounded px-3 py-1 ${tab === v ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {t(`cutter.result.${v}`)}
              </button>
            ))}
          </div>
        )}

        {result && tab === 'result' ? (
          <ShowcasePreview
            kind={kind}
            files={result.files}
            caption={result.frames ? t('cutter.result.sync') : undefined}
          />
        ) : source && poster && frame ? (
          <CropCanvas
            image={poster}
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
