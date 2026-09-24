import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_KIT,
  FPS_OPTIONS,
  UPLOAD_LIMIT_BYTES,
  clampHeight,
  crossesSeam,
  fitSceneFrame,
  hasAnimation,
  hiddenBetweenSlots,
  isCut,
  isProfileBackground,
  kitBox,
  kitItem,
  layerBounds,
  moveLayer,
  poseAt,
  showcaseBlockHeight,
  showcaseBox,
  type Frame,
  type ImageLayer,
  type KitItem,
  type Layer,
  type ProjectData,
  type ShowcaseKind,
} from '@profile-editor/core'
import BuilderStage from '../components/BuilderStage'
import LayerSettings, { type CutoutProgress } from '../components/LayerSettings'
import ProjectsPanel from '../components/ProjectsPanel'
import ShowcaseList from '../components/ShowcaseList'
import { RangeRow, Section, chipClass, inputClass, secondaryButton, toggleClass } from '../components/controls'
import { drawScene, layerSize, type Scene, type SceneBackground } from '../lib/compose'
import { removeBackground, type CutoutModel } from '../lib/cutout'
import { toMegabytes, type OutFormat } from '../lib/exportSlices'
import { useFontsReady } from '../lib/fonts'
import { effectLayer, imageLayer, textLayer } from '../lib/newLayer'
import { bitmapToBlob } from '../lib/projectsDb'
import { showcaseStore } from '../lib/showcaseStore'
import { SourceError, disposeSource, fromBlob, fromFile, fromLink, type Source } from '../lib/source'
import { useAssets } from '../lib/useAssets'
import { useHistory } from '../lib/useHistory'
import { useReducedMotion } from '../lib/useReducedMotion'
import { useProjectStorage, type Session } from '../lib/useProjectStorage'
import { useSceneExport } from '../lib/useSceneExport'

const KINDS: ShowcaseKind[] = ['artwork', 'featured', 'screenshot', 'workshop']
const DURATIONS = [1000, 1500, 2000, 3000, 4000]
const DEFAULT_HEIGHT = 700
const THUMB_WIDTH = 120

const newId = () => crypto.randomUUID()

const stageButton =
  'rounded-lg bg-ink/80 px-3 py-1 text-sm text-slate-300 hover:text-white disabled:pointer-events-none disabled:opacity-40'

// Состояние холста, которое ходит по истории правок
interface Doc {
  kind: ShowcaseKind
  // витрины комплекта, если холст собирают на весь профиль
  kit: KitItem[] | null
  frame: Frame | null
  height: number
  layers: Layer[]
  durationMs: number
  fps: number
  format: OutFormat
  hex: boolean
}

export default function Builder() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { lang } = useParams()
  const [searchParams] = useSearchParams()

  const [source, setSource] = useState<Source | null>(null)
  const [kind, setKind] = useState<ShowcaseKind>('artwork')
  const [kit, setKit] = useState<KitItem[] | null>(null)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState(2000)
  const [fps, setFps] = useState(15)
  const reducedMotion = useReducedMotion()
  const [playing, setPlaying] = useState(!reducedMotion)
  // момент цикла, который холст показывает на паузе: по нему правят ключи анимации
  const [playhead, setPlayhead] = useState(0)
  const [format, setFormat] = useState<OutFormat>('png')
  const [hex, setHex] = useState(false)
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cutoutModel, setCutoutModel] = useState<CutoutModel>('quality')
  const [cutout, setCutout] = useState<CutoutProgress | null>(null)
  const [cutoutError, setCutoutError] = useState<'failed' | 'empty' | null>(null)

  const assets = useAssets()
  const isEmpty = useRef(true)
  const backgroundInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const fontsVersion = useFontsReady(layers)

  // холст: одна витрина или вся левая колонка профиля сразу
  const box = useMemo(() => (kit ? kitBox(kit) : showcaseBox(kind, height)), [kit, kind, height])
  const scene = useMemo<Scene>(() => ({ box, layers, durationMs, fps }), [box, layers, durationMs, fps])
  const background = useMemo<SceneBackground | null>(
    () =>
      source && frame
        ? { image: source.type === 'still' ? source.image : source.poster, frame: { ...frame, height: box.height } }
        : null,
    [source, frame, box.height],
  )
  const selected = layers.find((l) => l.id === selectedId) ?? null
  const animated = hasAnimation(layers) || source?.type === 'animated'

  const exporter = useSceneExport({
    scene,
    background,
    assets: assets.bitmaps,
    source,
    frame,
    format,
    hex,
    animated,
  })

  // Что отменяется и возвращается. Фон сюда не входит: его Source живёт ровно один раз,
  // старый освобождается при замене, и вернуть его было бы нечем
  const doc = useMemo<Doc>(
    () => ({ kind, kit, frame, height, layers, durationMs, fps, format, hex }),
    [kind, kit, frame, height, layers, durationMs, fps, format, hex],
  )
  const history = useHistory(doc)

  // Слой, легший на стык частей витрины, в профиле разрежет пополам, а слой между витринами
  // не покажут вовсе. Заметить это на холсте трудно: зазор узкий, картинка через него читается
  const layerWarning = useMemo<'seam' | 'hidden' | null>(() => {
    if (!selected || selected.type === 'effect' || !selected.visible) return null
    const own = layerSize(selected)
    const rect = layerBounds(poseAt(selected, 0), own.width, own.height)
    if (hiddenBetweenSlots(box, rect)) return 'hidden'
    return crossesSeam(box, rect) ? 'seam' : null
  }, [selected, box])

  // всё, что попадает в сохранённый проект: поменялось — пора сохраняться заново
  const revision = useMemo(
    () => [source, kind, kit, frame, height, layers, durationMs, fps, format, hex, assets.version],
    [source, kind, kit, frame, height, layers, durationMs, fps, format, hex, assets.version],
  )

  const storage = useProjectStorage({
    revision,
    dirty: !!source || layers.length > 0,
    // пришли из каталога со ссылкой на фон: последнюю работу не открываем
    autoload: !searchParams.get('src'),
    snapshot,
    apply: applyProject,
    reset: resetDocument,
  })

  useEffect(() => {
    return () => {
      if (source) disposeSource(source)
    }
  }, [source])

  useEffect(() => {
    isEmpty.current = !source && layers.length === 0
  }, [source, layers])

  function applyDoc(next: Doc) {
    setKind(next.kind)
    setKit(next.kit)
    setFrame(next.frame)
    setHeight(next.height)
    setLayers(next.layers)
    setDurationMs(next.durationMs)
    setFps(next.fps)
    setFormat(next.format)
    setHex(next.hex)
    // слой мог исчезнуть вместе с отменённой правкой
    setSelectedId((id) => (next.layers.some((l) => l.id === id) ? id : null))
    exporter.reset()
  }

  function undo() {
    const previous = history.undo()
    if (previous) applyDoc(previous)
  }

  function redo() {
    const next = history.redo()
    if (next) applyDoc(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      const target = e.target as HTMLElement | null
      // пока человек печатает, отмена принадлежит полю ввода
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // картинки, на которые не ссылается ни холст, ни история, больше не нужны
  useEffect(() => {
    const alive = new Set<string>()
    for (const state of [doc, ...history.states()]) {
      for (const layer of state.layers) {
        if (layer.type !== 'image') continue
        alive.add(layer.assetId)
        if (layer.originalAssetId) alive.add(layer.originalAssetId)
      }
    }
    assets.keepOnly(alive)
  }, [doc, history, assets])

  async function loadBackground(task: () => Promise<Source>) {
    setLoading(true)
    setError(null)
    try {
      const next = await task()
      const fitted = fitSceneFrame(box, next.width, next.height)
      setSource(next)
      setFrame(fitted)
      // у комплекта высоту холста задают сами витрины
      if (!kit) setHeight(fitted.height)
      exporter.reset()
    } catch (err) {
      setError(err instanceof SourceError ? err.code : 'load_failed')
    } finally {
      setLoading(false)
    }
  }

  // из каталога приходим со ссылкой на фон в адресе
  const src = searchParams.get('src')
  useEffect(() => {
    if (!src) return
    setLink(src)
    loadBackground(() => fromLink(src))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  function onLinkSubmit(e: FormEvent) {
    e.preventDefault()
    if (link.trim()) loadBackground(() => fromLink(link))
  }

  function changeKind(next: ShowcaseKind) {
    setKind(next)
    setKit(null)
    setHex(next === 'workshop')
    exporter.reset()
    if (!source || !frame) return
    const nextBox = showcaseBox(next, height)
    setFrame(
      isProfileBackground(source.width)
        ? { ...frame, x: nextBox.origin.x }
        : { ...fitSceneFrame(nextBox, source.width, source.height), y: frame.y, height },
    )
  }

  // Холст на весь профиль: витрины стоят друг под другом, и картинка идёт через них насквозь
  function changeKit(next: KitItem[] | null) {
    setKit(next)
    exporter.reset()
    if (!source || !frame || !next?.length) return
    const nextBox = kitBox(next)
    setFrame(
      isProfileBackground(source.width)
        ? { ...frame, ...nextBox.origin, scale: 1 }
        : fitSceneFrame(nextBox, source.width, source.height),
    )
  }

  function changeFrame(next: Frame) {
    setFrame(next)
    exporter.reset()
  }

  function updateLayer(id: string, patch: Partial<Layer>) {
    setLayers((list) => list.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)))
    exporter.reset()
  }

  function removeLayer(id: string) {
    setLayers((list) => list.filter((l) => l.id !== id))
    if (selectedId === id) setSelectedId(null)
    exporter.reset()
  }

  function addLayer(layer: Layer) {
    setLayers((list) => [...list, layer])
    setSelectedId(layer.id)
    exporter.reset()
  }

  async function addImage(file?: File) {
    if (!file) return
    const bitmap = await createImageBitmap(file).catch(() => null)
    if (!bitmap) {
      setError('load_failed')
      return
    }
    const id = newId()
    assets.add(id, bitmap, file)
    addLayer(imageLayer(id, file.name, bitmap, box))
  }

  async function cutBackground(layer: ImageLayer) {
    const bitmap = assets.bitmaps.get(layer.assetId)
    if (!bitmap) return
    setCutoutError(null)
    setCutout({ layerId: layer.id, stage: 'download', percent: 0 })
    try {
      const cut = await removeBackground(await bitmapToBlob(bitmap), cutoutModel, (stage, percent) =>
        setCutout({ layerId: layer.id, stage, percent }),
      )
      // для сохранения проекта вырезку сразу держим и файлом
      const cutBlob = await bitmapToBlob(cut)
      const id = newId()
      assets.add(id, cut, cutBlob)
      updateLayer(layer.id, {
        assetId: id,
        originalAssetId: layer.originalAssetId ?? layer.assetId,
        width: cut.width,
        height: cut.height,
      })
    } catch (err) {
      const empty = err instanceof Error && err.message === 'empty'
      if (!empty) console.warn('background removal failed:', err)
      setCutoutError(empty ? 'empty' : 'failed')
    } finally {
      setCutout(null)
    }
  }

  function restoreOriginal(layer: ImageLayer) {
    if (!layer.originalAssetId) return
    const original = assets.bitmaps.get(layer.originalAssetId)
    assets.bump()
    updateLayer(layer.id, {
      assetId: layer.originalAssetId,
      originalAssetId: undefined,
      width: original?.width ?? layer.width,
      height: original?.height ?? layer.height,
    })
  }

  function drawThumbnail() {
    const canvas = document.createElement('canvas')
    const k = THUMB_WIDTH / box.width
    canvas.width = THUMB_WIDTH
    canvas.height = Math.max(1, Math.round(box.height * k))
    const ctx = canvas.getContext('2d')!
    try {
      ctx.scale(k, k)
      drawScene(ctx, scene, 0, background, assets.bitmaps)
    } catch {
      return null
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#171a21'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return canvas
  }

  // Снимок берём сразу, пока картинки в памяти ещё совпадают со слоями
  function snapshot() {
    const used: Record<string, Blob> = {}
    for (const layer of layers) {
      if (layer.type !== 'image') continue
      for (const id of [layer.assetId, layer.originalAssetId]) {
        const blob = id ? assets.blobs.get(id) : undefined
        if (id && blob) used[id] = blob
      }
    }
    const project: Omit<ProjectData, 'thumbnail'> = {
      id: storage.session.id,
      name: storage.name.trim() || storage.session.autoName,
      updatedAt: Date.now(),
      kind,
      kit,
      height,
      frame,
      durationMs,
      fps,
      format,
      hex,
      layers,
      background: source ? { blob: source.blob, name: source.name } : null,
      assets: used,
    }
    return { project, thumbnail: drawThumbnail() }
  }

  // то, что относилось к прошлой работе: подсказки, ссылка, выбранный слой, готовый архив
  function resetView() {
    setSelectedId(null)
    setError(null)
    setLink('')
    exporter.reset()
  }

  function resetDocument() {
    assets.clear()
    assets.bump()
    history.reset()
    resetView()
    setSource(null)
    setKit(null)
    setFrame(null)
    setHeight(DEFAULT_HEIGHT)
    setLayers([])
  }

  async function applyProject(data: ProjectData, onlyIfEmpty = false) {
    const bitmaps = new Map<string, ImageBitmap>()
    for (const [id, blob] of Object.entries(data.assets)) {
      const bitmap = await createImageBitmap(blob).catch(() => null)
      if (bitmap) bitmaps.set(id, bitmap)
    }
    let next: Source | null = null
    if (data.background) {
      try {
        next = await fromBlob(data.background.blob, data.background.name)
      } catch {
        // без фона не открываем, иначе автосохранение его потеряет
        bitmaps.forEach((bitmap) => bitmap.close())
        storage.setError('open')
        return
      }
    }
    // пока грузились, человек уже начал новую работу, её не трогаем
    if (onlyIfEmpty && !isEmpty.current) {
      bitmaps.forEach((bitmap) => bitmap.close())
      if (next) disposeSource(next)
      return
    }

    assets.load(bitmaps, data.assets)
    history.reset()
    const loaded: Session = { id: data.id, autoName: data.name }
    storage.adopt(loaded, { skip: true })
    storage.setName(data.name)
    resetView()
    setSource(next)
    setKind(data.kind)
    setKit(data.kit)
    const loadedBox = data.kit ? kitBox(data.kit) : showcaseBox(data.kind, data.height)
    setFrame(next ? (data.frame ?? fitSceneFrame(loadedBox, next.width, next.height)) : null)
    setHeight(data.height)
    setLayers(data.layers)
    setDurationMs(data.durationMs)
    setFps(data.fps)
    setFormat(data.format)
    setHex(data.hex)
  }

  function sendToPreview() {
    if (!exporter.groups) return
    const groups = exporter.groups
    if (!kit) groups.forEach((group) => showcaseStore.addShowcase(group.kind, group.files))
    for (const item of kit ?? []) {
      if (!isCut(item.kind)) {
        showcaseStore.addOther(showcaseBlockHeight(item.kind, item.height))
        continue
      }
      const group = groups.find((g) => g.id === item.id)
      if (group) showcaseStore.addShowcase(group.kind, group.files, { counter: item.counter })
    }
    if (source && isProfileBackground(source.width)) {
      showcaseStore.setBackground({ blob: source.blob, isVideo: source.blob.type.startsWith('video/') })
    }
    navigate(`/${lang}/preview`)
  }

  const groups = exporter.groups
  const exportLabel = kit
    ? animated
      ? 'kit.export.gifButton'
      : 'kit.export.button'
    : animated
      ? 'cutter.export.gifButton'
      : 'cutter.export.button'

  const layerLabel = (layer: Layer) => {
    if (layer.type === 'text') return layer.text.split('\n')[0] || '…'
    if (layer.type === 'effect') return t(`builder.effects.${layer.effect}`)
    return layer.name
  }
  const layerIcon = { text: 'T', image: '▣', effect: '✦' }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[340px_1fr]">
      <aside className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t('builder.title')}</h1>
          <p className="mt-2 text-sm text-slate-400">{t('builder.lead')}</p>
        </div>

        <ProjectsPanel
          projects={storage.projects}
          currentId={storage.session.id}
          name={storage.name}
          placeholder={storage.session.autoName}
          status={storage.saveState}
          error={storage.error}
          canExport={!!source || layers.length > 0}
          onName={storage.setName}
          onOpen={(project) => storage.open(project.id)}
          onDelete={storage.remove}
          onNew={storage.newProject}
          onExport={storage.exportFile}
          onImport={storage.importFile}
        />

        <Section title={t('builder.background.title')}>
          <button type="button" onClick={() => backgroundInput.current?.click()} className={`${secondaryButton} w-full`}>
            {t('cutter.source.file')}
          </button>
          <input
            ref={backgroundInput}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) loadBackground(() => fromFile(file))
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

          <div className="mt-3 grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button key={k} type="button" onClick={() => changeKind(k)} className={toggleClass(!kit && k === kind)}>
                <div className="text-sm font-medium">{t(`cutter.kind.${k}`)}</div>
                <div className="text-xs text-slate-500">{t(`cutter.kind.${k}Size`)}</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => changeKit(kit ?? DEFAULT_KIT.map((k) => kitItem(k)))}
            className={`${toggleClass(!!kit)} mt-2 w-full`}
          >
            <div className="text-sm font-medium">{t('builder.kit.title')}</div>
            <div className="text-xs text-slate-500">{t('builder.kit.hint')}</div>
          </button>

          <div className="mt-3 space-y-3 text-sm">
            {kit ? (
              <ShowcaseList
                items={kit}
                onChange={changeKit}
                onAdd={(k) => {
                  if (k === 'workshop') setHex(true)
                }}
              />
            ) : (
              <RangeRow
                label={t('cutter.frame.height')}
                display={`${height}`}
                value={height}
                min={100}
                max={2000}
                onChange={(value) => {
                  setHeight(clampHeight(value))
                  exporter.reset()
                }}
              />
            )}
            {source && frame && (
              <div className="flex gap-2">
                {isProfileBackground(source.width) && (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => changeFrame({ ...frame, ...box.origin, scale: 1 })}
                  >
                    {t('cutter.frame.alignProfile')}
                  </button>
                )}
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() =>
                    changeFrame({ ...fitSceneFrame(box, source.width, source.height), y: frame.y, height: box.height })
                  }
                >
                  {t('cutter.frame.fitWidth')}
                </button>
              </div>
            )}
            <p className="text-xs text-slate-500">{t('builder.background.hint')}</p>
          </div>
        </Section>

        <Section title={t('builder.layers.title')}>
          <div className="flex gap-2">
            <button type="button" onClick={() => imageInput.current?.click()} className={`${secondaryButton} flex-1`}>
              + {t('builder.layers.addImage')}
            </button>
            <button
              type="button"
              onClick={() => addLayer(textLayer(newId(), t('builder.defaultText'), box))}
              className={`${secondaryButton} flex-1`}
            >
              + {t('builder.layers.addText')}
            </button>
            <button
              type="button"
              onClick={() => addLayer(effectLayer(newId(), box))}
              className={`${secondaryButton} flex-1`}
            >
              + {t('builder.layers.addEffect')}
            </button>
          </div>
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              addImage(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {layers.length === 0 && <p className="mt-2 text-xs text-slate-500">{t('builder.layers.empty')}</p>}
          <ul className="mt-3 space-y-1" data-layers>
            {[...layers].reverse().map((layer) => (
              <li
                key={layer.id}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
                  layer.id === selectedId ? 'border-accent bg-accent/10' : 'border-line bg-panel'
                }`}
              >
                <button type="button" onClick={() => setSelectedId(layer.id)} className="min-w-0 flex-1 truncate text-left text-slate-200">
                  <span className="mr-2 text-xs text-slate-500">{layerIcon[layer.type]}</span>
                  {layerLabel(layer)}
                </button>
                <button
                  type="button"
                  title={t(layer.visible ? 'builder.layers.hide' : 'builder.layers.show')}
                  aria-label={t(layer.visible ? 'builder.layers.hide' : 'builder.layers.show')}
                  onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                  className={`px-1 ${layer.visible ? 'text-slate-400' : 'text-slate-600'} hover:text-white`}
                >
                  {layer.visible ? '◉' : '○'}
                </button>
                <button
                  type="button"
                  title={t('builder.layers.up')}
                  aria-label={t('builder.layers.up')}
                  onClick={() => setLayers((list) => moveLayer(list, layer.id, 1))}
                  className="px-1 text-slate-400 hover:text-white"
                >
                  ↑
                </button>
                <button
                  type="button"
                  title={t('builder.layers.down')}
                  aria-label={t('builder.layers.down')}
                  onClick={() => setLayers((list) => moveLayer(list, layer.id, -1))}
                  className="px-1 text-slate-400 hover:text-white"
                >
                  ↓
                </button>
                <button
                  type="button"
                  title={t('builder.layers.remove')}
                  aria-label={t('builder.layers.remove')}
                  onClick={() => removeLayer(layer.id)}
                  className="px-1 text-slate-400 hover:text-red-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Section>

        {selected && (
          <LayerSettings
            layer={selected}
            cutoutModel={cutoutModel}
            cutout={cutout}
            cutoutError={cutoutError}
            warning={layerWarning}
            time={playhead}
            onTime={(time) => {
              setPlaying(false)
              setPlayhead(time)
            }}
            onCutoutModel={setCutoutModel}
            onChange={(patch) => updateLayer(selected.id, patch)}
            onCut={cutBackground}
            onRestore={restoreOriginal}
          />
        )}

        {animated && (
          <Section title={t('builder.loop.title')}>
            <div className="space-y-3 text-sm">
              <div>
                <span className="mb-1 block text-slate-400">{t('builder.loop.duration')}</span>
                <div className="flex flex-wrap gap-1">
                  {DURATIONS.map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      onClick={() => {
                        setDurationMs(ms)
                        exporter.reset()
                      }}
                      className={chipClass(ms === durationMs)}
                    >
                      {t('cutter.clip.seconds', { s: (ms / 1000).toFixed(1) })}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1 block text-slate-400">{t('cutter.clip.fps')}</span>
                <div className="flex gap-1">
                  {FPS_OPTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setFps(value)
                        exporter.reset()
                      }}
                      className={chipClass(value === fps)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
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
              {source?.type === 'animated' && <p className="text-xs text-slate-500">{t('builder.loop.videoNote')}</p>}
            </div>
          </Section>
        )}

        {!animated && (
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
                  className={toggleClass(f === format)}
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
          disabled={(!source && layers.length === 0) || !!exporter.busy}
          className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-ink disabled:opacity-50"
        >
          {exporter.label ?? t(exportLabel)}
        </button>
        {exporter.error && <p className="text-sm text-red-400">{t(`cutter.export.${exporter.error}`)}</p>}

        {groups && (
          <div className="space-y-3">
            {groups.map((group, index) => (
              <div key={group.id}>
                {groups.length > 1 && (
                  <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                    {index + 1}. {t(`cutter.kind.${group.kind}`)}
                  </div>
                )}
                <ul className="space-y-1 text-sm">
                  {group.files.map((f) => (
                    <li key={f.name} className="flex justify-between">
                      <span className="text-slate-300">{f.name}</span>
                      <span className={f.blob.size > UPLOAD_LIMIT_BYTES ? 'text-red-400' : 'text-slate-500'}>
                        {t('cutter.export.size', { mb: toMegabytes(f.blob.size) })}
                      </span>
                    </li>
                  ))}
                </ul>
                {group.thinned && <p className="mt-1 text-xs text-amber-300/80">{t('cutter.result.thinned')}</p>}
              </div>
            ))}
            <button type="button" onClick={sendToPreview} className={`${secondaryButton} w-full`}>
              {kit ? t('kit.result.toPreview') : t('cutter.result.toPreview')}
            </button>
            {kit && <p className="text-xs text-slate-500">{t('kit.result.order')}</p>}
            <p className="text-xs">
              <Link to={`/${lang}/guide#helper`} className="text-accent hover:underline">
                {t('cutter.upload.helper')}
              </Link>
            </p>
          </div>
        )}
      </aside>

      <section className="relative h-[calc(100vh-9rem)] min-h-[480px] overflow-hidden rounded-xl border border-line bg-panel/40 lg:sticky lg:top-4 lg:self-start">
        <div className="absolute left-3 top-3 z-10 flex gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!history.canUndo}
            title={`${t('builder.undo')} (Ctrl+Z)`}
            aria-label={t('builder.undo')}
            className={stageButton}
          >
            ↶
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!history.canRedo}
            title={`${t('builder.redo')} (Ctrl+Shift+Z)`}
            aria-label={t('builder.redo')}
            className={stageButton}
          >
            ↷
          </button>
        </div>
        {animated && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="absolute right-3 top-3 z-10 rounded-lg bg-ink/80 px-3 py-1 text-sm text-slate-300 hover:text-white"
          >
            {playing ? t('builder.loop.pause') : t('builder.loop.play')}
          </button>
        )}
        <BuilderStage
          scene={scene}
          background={background}
          assets={assets.bitmaps}
          selectedId={selectedId}
          playing={playing && animated}
          time={playhead}
          redraw={fontsVersion + assets.version}
          onSelect={setSelectedId}
          onLayerChange={updateLayer}
          onBackgroundChange={changeFrame}
          onRemove={removeLayer}
        />
        {!source && layers.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="max-w-sm text-sm text-slate-500">{t('builder.empty')}</p>
          </div>
        )}
      </section>
    </div>
  )
}
