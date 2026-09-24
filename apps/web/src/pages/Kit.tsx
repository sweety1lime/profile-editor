import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_KIT,
  FPS_OPTIONS,
  MAX_CLIP_SECONDS,
  UPLOAD_LIMIT_BYTES,
  UPLOAD_PAGE,
  buildTimeline,
  encodePalette,
  fitKit,
  isProfileBackground,
  kitItem,
  kitSlots,
  nearestFps,
  type KitItem,
  type KitPlacement,
  type ShowcaseKind,
} from '@profile-editor/core'
import KitCanvas from '../components/KitCanvas'
import ShowcaseList from '../components/ShowcaseList'
import { RangeRow, Section, inputClass, secondaryButton } from '../components/controls'
import { paletteFromImage } from '../lib/palette'
import { askPersistentStorage, kitDb, type KitSession } from '../lib/projectsDb'
import { showcaseStore } from '../lib/showcaseStore'
import { SourceError, disposeSource, fromBlob, fromFile, fromLink, type Source } from '../lib/source'
import { toMegabytes, type OutFormat } from '../lib/exportSlices'
import { useKitExport } from '../lib/useKitExport'

const KINDS: ShowcaseKind[] = ['artwork', 'featured', 'screenshot', 'workshop']
const DEFAULT_CLIP_SECONDS = 5
const MIN_CLIP_SECONDS = 0.2
// работа сохраняется после небольшой паузы в правках
const SAVE_DELAY = 600

interface Clip {
  start: number
  length: number
  fps: number
}

const IDENTITY: KitPlacement = { x: 0, y: 0, scale: 1 }

export default function Kit() {
  const { t } = useTranslation()
  const [source, setSource] = useState<Source | null>(null)
  const [items, setItems] = useState<KitItem[]>(() => DEFAULT_KIT.map((kind) => kitItem(kind)))
  const [placement, setPlacement] = useState<KitPlacement>(IDENTITY)
  const [clip, setClip] = useState<Clip | null>(null)
  const [hex, setHex] = useState(false)
  const [format, setFormat] = useState<OutFormat>('png')
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState<string | null>(null)
  const navigate = useNavigate()
  const { lang } = useParams()
  const fileInput = useRef<HTMLInputElement>(null)
  const sourceRef = useRef<Source | null>(null)
  const restoring = useRef(false)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  // растёт при «Начать заново», чтобы запоздавшее сохранение не вернуло старую работу
  const generation = useRef(0)

  const slots = useMemo(() => kitSlots(items), [items])
  const timeline = clip ? buildTimeline(clip.start, clip.length, clip.fps) : null
  const exporter = useKitExport({ source, items, placement, timeline, format, hex })

  // старый исходник освобождаем, когда пришёл новый
  useEffect(() => {
    sourceRef.current = source
    return () => {
      if (source) disposeSource(source)
    }
  }, [source])

  useEffect(() => {
    if (!source) return
    const gen = generation.current
    const timer = setTimeout(() => {
      if (gen !== generation.current) return
      const session: KitSession = { name: source.name, items, placement, clip, hex, format, savedAt: Date.now() }
      saveQueue.current = saveQueue.current
        .then(() => kitDb.save(session, source.blob))
        .then(askPersistentStorage)
        .catch((err) => console.warn('kit save failed:', err))
    }, SAVE_DELAY)
    return () => clearTimeout(timer)
  }, [source, items, placement, clip, hex, format])

  // из каталога и нарезчика приходим со ссылкой на арт в адресе
  const [searchParams] = useSearchParams()
  const src = searchParams.get('src')
  useEffect(() => {
    if (!src) return
    setLink(src)
    load(() => fromLink(src))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  // без ссылки в адресе возвращаем комплект, который собирали в прошлый раз
  useEffect(() => {
    if (src || restoring.current) return
    restoring.current = true
    kitDb
      .load()
      .then(async (saved) => {
        if (!saved) return
        const { session } = saved
        const next = await fromBlob(saved.blob, session.name)
        // пока грузили, уже выбрали другой файл
        if (sourceRef.current) {
          disposeSource(next)
          return
        }
        setSource(next)
        setItems(session.items)
        setPlacement(session.placement)
        setClip(
          next.type === 'animated'
            ? (session.clip ?? { start: 0, length: Math.min(next.duration, DEFAULT_CLIP_SECONDS), fps: nearestFps(next.fps) })
            : null,
        )
        setHex(session.hex)
        setFormat(session.format)
        setRestored(session.name)
      })
      .catch((err) => console.warn('kit restore failed:', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startOver() {
    generation.current++
    setSource(null)
    setItems(DEFAULT_KIT.map((kind) => kitItem(kind)))
    setPlacement(IDENTITY)
    setClip(null)
    setRestored(null)
    setLink('')
    setError(null)
    exporter.reset()
    saveQueue.current = saveQueue.current.then(() => kitDb.clear()).catch(() => {})
  }

  async function load(task: () => Promise<Source>) {
    setLoading(true)
    setError(null)
    try {
      const next = await task()
      setSource(next)
      setRestored(null)
      // фон профиля ложится на своё место один в один, любой другой арт вписываем в комплект
      setPlacement(isProfileBackground(next.width) ? IDENTITY : fitKit(next.width, next.height, slots))
      setClip(
        next.type === 'animated'
          ? { start: 0, length: Math.min(next.duration, DEFAULT_CLIP_SECONDS), fps: nearestFps(next.fps) }
          : null,
      )
      exporter.reset()
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

  function changeItems(next: KitItem[]) {
    setItems(next)
    exporter.reset()
  }

  // мастерская пережимает гифки сильнее всего, для неё патч нужен почти всегда
  function onAddShowcase(kind: ShowcaseKind) {
    if (kind === 'workshop') setHex(true)
  }

  function changePlacement(next: KitPlacement) {
    setPlacement(next)
    exporter.reset()
  }

  function changeClip(patch: Partial<Clip>) {
    if (!clip || source?.type !== 'animated') return
    const next = { ...clip, ...patch }
    const maxLength = Math.max(MIN_CLIP_SECONDS, Math.min(MAX_CLIP_SECONDS, source.duration - next.start))
    next.length = Math.min(Math.max(next.length, MIN_CLIP_SECONDS), maxLength)
    setClip(next)
    exporter.reset()
  }

  // Считаем палитру арта и открываем каталог фонов, отсортированный по похожести:
  // фон профиля не загрузить своим файлом, его остаётся только подобрать
  function matchBackground() {
    if (!source) return
    const image = source.type === 'still' ? source.image : source.poster
    const palette = paletteFromImage(image, source.width, source.height)
    if (palette.length) navigate(`/${lang}/backgrounds?palette=${encodePalette(palette)}`)
  }

  // Отдаём весь комплект в превью тем же порядком, каким он стоит на странице профиля
  function sendToPreview() {
    if (!exporter.groups || !source) return
    for (const group of exporter.groups) {
      const counter = items.find((item) => item.id === group.id)?.counter
      showcaseStore.addShowcase(group.kind, group.files, { counter })
    }
    if (isProfileBackground(source.width)) {
      showcaseStore.setBackground({ blob: source.blob, isVideo: source.blob.type.startsWith('video/') })
    }
    navigate(`/${lang}/preview`)
  }

  const poster = source ? (source.type === 'still' ? source.image : source.poster) : null
  const zoom = Math.round(placement.scale * 100)
  const labels = useMemo(
    () => Object.fromEntries(KINDS.map((kind) => [kind, t(`cutter.kind.${kind}`)])) as Record<ShowcaseKind, string>,
    [t],
  )
  const files = exporter.groups?.flatMap((group) => group.files) ?? []
  const tooBig = files.some((file) => file.blob.size > UPLOAD_LIMIT_BYTES)
  const seconds = (s: number) => t('cutter.clip.seconds', { s: s.toFixed(1) })

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[340px_1fr]">
      <aside className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t('kit.title')}</h1>
          <p className="mt-2 text-sm text-slate-400">{t('kit.lead')}</p>
        </div>

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
          {error && <p className="mt-2 text-sm text-red-400">{t(`cutter.errors.${error}`)}</p>}
          {restored && source && (
            <div
              className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-line bg-panel/60 px-3 py-2 text-xs text-slate-400"
              data-restored
            >
              <span className="min-w-0 truncate">{t('cutter.restore.restored', { name: restored })}</span>
              <button type="button" onClick={startOver} className="shrink-0 text-accent hover:underline">
                {t('cutter.restore.reset')}
              </button>
            </div>
          )}
          {source && (
            <button type="button" onClick={matchBackground} className={`${secondaryButton} mt-3 w-full`}>
              {t('kit.matchBackground')}
            </button>
          )}
        </Section>

        <Section title={t('kit.showcases.title')}>
          <ShowcaseList items={items} onChange={changeItems} onAdd={onAddShowcase} />
        </Section>

        {source && items.length > 0 && (
          <Section title={t('kit.place.title')}>
            <div className="space-y-3 text-sm">
              <RangeRow
                label={t('kit.place.zoom')}
                display={`${zoom}%`}
                value={Math.min(400, Math.max(5, zoom))}
                min={5}
                max={400}
                onChange={(value) => changePlacement({ ...placement, scale: value / 100 })}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => changePlacement(fitKit(source.width, source.height, slots))}
                >
                  {t('kit.place.fit')}
                </button>
                {isProfileBackground(source.width) && (
                  <button type="button" className={secondaryButton} onClick={() => changePlacement(IDENTITY)}>
                    {t('kit.place.align')}
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {t('cutter.frame.position', { x: Math.round(placement.x), y: Math.round(placement.y) })} ·{' '}
                {t('kit.place.hint')}
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
              <p className="text-xs text-slate-500">{t('kit.export.gifHint', { count: items.length })}</p>
              <label className="flex items-start gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={hex}
                  onChange={(e) => {
                    setHex(e.target.checked)
                    exporter.reset()
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
                    exporter.reset()
                  }}
                  className={`rounded-lg border px-3 py-2 ${
                    f === format ? 'border-accent bg-accent/10 text-white' : 'border-line bg-panel text-slate-300'
                  }`}
                >
                  <span className="text-sm uppercase">{f}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        <button
          type="button"
          onClick={exporter.run}
          disabled={!source || !items.length || !!exporter.busy}
          className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-ink disabled:opacity-50"
        >
          {exporter.label ?? t(source?.type === 'animated' ? 'kit.export.gifButton' : 'kit.export.button')}
        </button>

        {exporter.error && <p className="text-sm text-red-400">{t(`cutter.export.${exporter.error}`)}</p>}

        {exporter.groups && (
          <div className="space-y-3">
            {exporter.groups.map((group, index) => (
              <div key={group.id}>
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  {index + 1}. {t(`cutter.kind.${group.kind}`)}
                </div>
                <ul className="space-y-1 text-sm">
                  {group.files.map((file) => (
                    <li key={file.name} className="flex justify-between">
                      <span className="text-slate-300">{file.name}</span>
                      <span className={file.blob.size > UPLOAD_LIMIT_BYTES ? 'text-red-400' : 'text-slate-500'}>
                        {t('cutter.export.size', { mb: toMegabytes(file.blob.size) })}
                      </span>
                    </li>
                  ))}
                </ul>
                {group.thinned && <p className="mt-1 text-xs text-amber-300/80">{t('cutter.result.thinned')}</p>}
              </div>
            ))}
            {tooBig && <p className="text-sm text-red-400">{t('cutter.export.tooBig')}</p>}
            <button type="button" onClick={sendToPreview} className={`${secondaryButton} w-full`}>
              {t('kit.result.toPreview')}
            </button>
            <p className="text-xs text-slate-500">{t('kit.result.order')}</p>
          </div>
        )}

        <details className="rounded-lg border border-line bg-panel p-4 text-sm">
          <summary className="cursor-pointer text-slate-300">{t('cutter.upload.title')}</summary>
          <div className="mt-3 space-y-2 text-slate-400">
            <p>{t('kit.upload.intro')}</p>
            <p>
              {t('cutter.upload.step1', { url: '' })}
              <a href={UPLOAD_PAGE} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">
                {UPLOAD_PAGE}
              </a>
            </p>
            <p>{t('cutter.upload.step2')}</p>
            <p>{t('cutter.upload.step3')}</p>
            <p className="text-xs">
              <Link to={`/${lang}/guide#helper`} className="text-accent hover:underline">
                {t('cutter.upload.helper')}
              </Link>
            </p>
          </div>
        </details>
      </aside>

      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="relative h-[calc(100vh-9rem)] min-h-[480px] overflow-hidden rounded-xl border border-line bg-panel/40 lg:sticky lg:top-4 lg:self-start"
      >
        {source && poster && items.length > 0 ? (
          <KitCanvas
            image={poster}
            imageWidth={source.width}
            imageHeight={source.height}
            slots={slots}
            placement={placement}
            labels={labels}
            onChange={changePlacement}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-lg text-white">{t('kit.empty.title')}</p>
            <p className="max-w-sm text-sm text-slate-500">{t('kit.empty.text')}</p>
          </div>
        )}
      </section>
    </div>
  )
}
