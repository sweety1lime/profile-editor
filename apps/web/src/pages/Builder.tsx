import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  ANIMATIONS,
  FPS_OPTIONS,
  PROFILE_OFFSET,
  UPLOAD_LIMIT_BYTES,
  UPLOAD_PAGE,
  UPLOAD_SNIPPETS,
  buildTimeline,
  clampHeight,
  fitFrame,
  hasAnimation,
  isProfileBackground,
  moveLayer,
  sliceRects,
  type Frame,
  type ImageLayer,
  type Layer,
  type ShowcaseKind,
  type TextLayer,
} from '@profile-editor/core'
import BuilderStage from '../components/BuilderStage'
import { RangeRow, Section, chipClass, inputClass, secondaryButton, toggleClass } from '../components/controls'
import { drawScene, sceneSource, sceneWidth, type Scene, type SceneBackground } from '../lib/compose'
import { buildZip, download, renderSlices, toMegabytes, type ExportedFile, type OutFormat } from '../lib/exportSlices'
import { removeBackground, type CutoutModel } from '../lib/cutout'
import { FONTS, useFontsReady } from '../lib/fonts'
import { showcaseStore } from '../lib/showcaseStore'
import { SourceError, disposeSource, fromFile, fromLink, type Source } from '../lib/source'
import type { Progress } from '../lib/encodeGif'

const KINDS: ShowcaseKind[] = ['artwork', 'featured', 'screenshot', 'workshop']
const DURATIONS = [1000, 1500, 2000, 3000, 4000]
const DEFAULT_HEIGHT = 700

type Busy = Progress | { stage: 'still' }

interface Result {
  files: ExportedFile[]
  frames?: number
  thinned?: boolean
}

const newId = () => crypto.randomUUID()

export default function Builder() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { lang } = useParams()
  const [searchParams] = useSearchParams()
  const [source, setSource] = useState<Source | null>(null)
  const [kind, setKind] = useState<ShowcaseKind>('artwork')
  const [frame, setFrame] = useState<Frame | null>(null)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [assets] = useState(() => new Map<string, ImageBitmap>())
  const [assetsVersion, setAssetsVersion] = useState(0)
  const [durationMs, setDurationMs] = useState(2000)
  const [fps, setFps] = useState(15)
  const [playing, setPlaying] = useState(true)
  const [format, setFormat] = useState<OutFormat>('png')
  const [hex, setHex] = useState(false)
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [cutoutModel, setCutoutModel] = useState<CutoutModel>('quality')
  const [cutout, setCutout] = useState<{ layerId: string; stage: 'download' | 'run'; percent: number } | null>(null)
  const [cutoutError, setCutoutError] = useState<'failed' | 'empty' | null>(null)
  const backgroundInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const fontsVersion = useFontsReady(layers)

  const width = sceneWidth(kind)
  const scene = useMemo<Scene>(() => ({ kind, height, layers, durationMs, fps }), [kind, height, layers, durationMs, fps])
  const background = useMemo<SceneBackground | null>(
    () =>
      source && frame
        ? { image: source.type === 'still' ? source.image : source.poster, frame: { ...frame, height } }
        : null,
    [source, frame, height],
  )
  const selected = layers.find((l) => l.id === selectedId) ?? null
  const animated = hasAnimation(layers) || source?.type === 'animated'

  useEffect(() => {
    return () => {
      if (source) disposeSource(source)
    }
  }, [source])

  useEffect(() => {
    return () => assets.forEach((bitmap) => bitmap.close())
  }, [assets])

  function resetResult() {
    setResult(null)
    setExportError(null)
  }

  async function loadBackground(task: () => Promise<Source>) {
    setLoading(true)
    setError(null)
    try {
      const next = await task()
      const fitted = fitFrame(kind, next.width, next.height)
      setSource(next)
      setFrame(fitted)
      setHeight(fitted.height)
      resetResult()
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
    setHex(next === 'workshop')
    resetResult()
    if (!source || !frame) return
    setFrame(
      isProfileBackground(source.width)
        ? { ...frame, x: PROFILE_OFFSET[next].x }
        : { ...fitFrame(next, source.width, source.height), y: frame.y, height },
    )
  }

  function changeFrame(next: Frame) {
    setFrame(next)
    resetResult()
  }

  function updateLayer(id: string, patch: Partial<Layer>) {
    setLayers((list) => list.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)))
    resetResult()
  }

  function removeLayer(id: string) {
    const layer = layers.find((l) => l.id === id)
    if (layer?.type === 'image') {
      for (const id of [layer.assetId, layer.originalAssetId]) {
        if (!id) continue
        assets.get(id)?.close()
        assets.delete(id)
      }
    }
    setLayers((list) => list.filter((l) => l.id !== id))
    if (selectedId === id) setSelectedId(null)
    resetResult()
  }

  async function addImage(file?: File) {
    if (!file) return
    const bitmap = await createImageBitmap(file).catch(() => null)
    if (!bitmap) {
      setError('load_failed')
      return
    }
    const id = newId()
    assets.set(id, bitmap)
    setAssetsVersion((v) => v + 1)
    const layer: ImageLayer = {
      id,
      type: 'image',
      name: file.name,
      assetId: id,
      width: bitmap.width,
      height: bitmap.height,
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      scale: Math.min(1, (width * 0.8) / bitmap.width, (height * 0.8) / bitmap.height),
      rotation: 0,
      opacity: 1,
      visible: true,
      animation: 'none',
      strength: 0.6,
    }
    setLayers((list) => [...list, layer])
    setSelectedId(id)
    resetResult()
  }

  function addText() {
    const id = newId()
    const text = t('builder.defaultText')
    const layer: TextLayer = {
      id,
      type: 'text',
      name: text,
      text,
      font: 'Russo One',
      size: 56,
      weight: 400,
      color: '#ffffff',
      stroke: 3,
      strokeColor: '#000000',
      glow: 0,
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      scale: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      animation: 'none',
      strength: 0.6,
    }
    setLayers((list) => [...list, layer])
    setSelectedId(id)
    resetResult()
  }

  async function cutBackground(layer: ImageLayer) {
    const bitmap = assets.get(layer.assetId)
    if (!bitmap) return
    setCutoutError(null)
    setCutout({ layerId: layer.id, stage: 'download', percent: 0 })
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      const cut = await removeBackground(blob, cutoutModel, (stage, percent) =>
        setCutout({ layerId: layer.id, stage, percent }),
      )
      const id = newId()
      assets.set(id, cut)
      // прошлую вырезку выбрасываем, оригинал оставляем
      if (layer.originalAssetId) {
        assets.get(layer.assetId)?.close()
        assets.delete(layer.assetId)
      }
      setAssetsVersion((v) => v + 1)
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
    const original = assets.get(layer.originalAssetId)
    assets.get(layer.assetId)?.close()
    assets.delete(layer.assetId)
    setAssetsVersion((v) => v + 1)
    updateLayer(layer.id, {
      assetId: layer.originalAssetId,
      originalAssetId: undefined,
      width: original?.width ?? layer.width,
      height: original?.height ?? layer.height,
    })
  }

  function readme() {
    const lines = [t('cutter.readme', { kind: t(`cutter.kind.${kind}`) }), '']
    lines.push(t('cutter.upload.step1', { url: UPLOAD_PAGE }), t('cutter.upload.step2'), t('cutter.upload.step3'))
    lines.push('', UPLOAD_SNIPPETS[kind], '')
    lines.push(t(kind === 'workshop' ? 'cutter.upload.workshopNote' : 'cutter.upload.note'))
    return lines.join('\n')
  }

  async function onExport() {
    setExportError(null)
    const sliceFrame: Frame = { x: 0, y: 0, scale: 1, height }
    try {
      let next: Result
      if (!animated) {
        setBusy({ stage: 'still' })
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        drawScene(canvas.getContext('2d')!, scene, 0, background, assets)
        next = { files: await renderSlices(canvas, sliceRects(kind, sliceFrame), format) }
      } else {
        const { encodeAnimated } = await import('../lib/encodeGif')
        const timeline = buildTimeline(0, durationMs / 1000, fps)
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
          setExportError('animTooBig')
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
      setExportError('failed')
    } finally {
      setBusy(null)
    }
  }

  function sendToPreview() {
    if (!result) return
    showcaseStore.addShowcase(kind, result.files)
    if (source && isProfileBackground(source.width)) {
      showcaseStore.setBackground({ blob: source.blob, isVideo: source.blob.type.startsWith('video/') })
    }
    navigate(`/${lang}/preview`)
  }

  let busyLabel: string | null = null
  if (busy?.stage === 'still') busyLabel = t('cutter.export.working')
  else if (busy?.stage === 'frames') busyLabel = t('cutter.export.frames', { done: busy.done, total: busy.total })
  else if (busy?.stage === 'encode') busyLabel = t(busy.attempt > 1 ? 'cutter.export.thinning' : 'cutter.export.encoding')

  const layerLabel = (layer: Layer) => (layer.type === 'text' ? layer.text.split('\n')[0] || '…' : layer.name)

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[340px_1fr]">
      <aside className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t('builder.title')}</h1>
          <p className="mt-2 text-sm text-slate-400">{t('builder.lead')}</p>
        </div>

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
              <button key={k} type="button" onClick={() => changeKind(k)} className={toggleClass(k === kind)}>
                <div className="text-sm font-medium">{t(`cutter.kind.${k}`)}</div>
                <div className="text-xs text-slate-500">{t(`cutter.kind.${k}Size`)}</div>
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-3 text-sm">
            <RangeRow
              label={t('cutter.frame.height')}
              display={`${height}`}
              value={height}
              min={100}
              max={2000}
              onChange={(value) => {
                setHeight(clampHeight(value))
                resetResult()
              }}
            />
            {source && frame && (
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
                  onClick={() => changeFrame({ ...fitFrame(kind, source.width, source.height), y: frame.y, height })}
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
            <button type="button" onClick={addText} className={`${secondaryButton} flex-1`}>
              + {t('builder.layers.addText')}
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
          <ul className="mt-3 space-y-1">
            {[...layers].reverse().map((layer) => (
              <li
                key={layer.id}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
                  layer.id === selectedId ? 'border-accent bg-accent/10' : 'border-line bg-panel'
                }`}
              >
                <button type="button" onClick={() => setSelectedId(layer.id)} className="min-w-0 flex-1 truncate text-left text-slate-200">
                  <span className="mr-2 text-xs text-slate-500">{layer.type === 'text' ? 'T' : '▣'}</span>
                  {layerLabel(layer)}
                </button>
                <button
                  type="button"
                  title={t(layer.visible ? 'builder.layers.hide' : 'builder.layers.show')}
                  onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                  className={`px-1 ${layer.visible ? 'text-slate-400' : 'text-slate-600'} hover:text-white`}
                >
                  {layer.visible ? '◉' : '○'}
                </button>
                <button
                  type="button"
                  title={t('builder.layers.up')}
                  onClick={() => setLayers((list) => moveLayer(list, layer.id, 1))}
                  className="px-1 text-slate-400 hover:text-white"
                >
                  ↑
                </button>
                <button
                  type="button"
                  title={t('builder.layers.down')}
                  onClick={() => setLayers((list) => moveLayer(list, layer.id, -1))}
                  className="px-1 text-slate-400 hover:text-white"
                >
                  ↓
                </button>
                <button
                  type="button"
                  title={t('builder.layers.remove')}
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
          <Section title={t('builder.layer.title')}>
            <div className="space-y-3 text-sm">
              {selected.type === 'image' && (
                <div className="space-y-2 rounded-lg border border-line bg-panel/60 p-3" data-cutout>
                  <div className="text-slate-300">{t('builder.cutout.title')}</div>
                  <div className="flex gap-1">
                    {(['quality', 'fast'] as const).map((model) => (
                      <button key={model} type="button" onClick={() => setCutoutModel(model)} className={chipClass(model === cutoutModel)}>
                        {t(`builder.cutout.models.${model}`)}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!!cutout}
                      onClick={() => cutBackground(selected)}
                      className={`${secondaryButton} flex-1`}
                    >
                      {cutout?.layerId === selected.id
                        ? cutout.stage === 'download'
                          ? t('builder.cutout.downloading', { percent: Math.round(cutout.percent) })
                          : t('builder.cutout.running')
                        : t('builder.cutout.run')}
                    </button>
                    {selected.originalAssetId && (
                      <button type="button" disabled={!!cutout} onClick={() => restoreOriginal(selected)} className={secondaryButton}>
                        {t('builder.cutout.restore')}
                      </button>
                    )}
                  </div>
                  {cutoutError && (
                    <p className="text-xs text-red-400">
                      {t(cutoutError === 'empty' ? 'builder.cutout.empty' : 'builder.cutout.error')}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">{t(`builder.cutout.note.${cutoutModel}`)}</p>
                </div>
              )}
              {selected.type === 'text' && (
                <>
                  <textarea
                    value={selected.text}
                    onChange={(e) => updateLayer(selected.id, { text: e.target.value })}
                    rows={2}
                    className={inputClass}
                    aria-label={t('builder.layer.text')}
                  />
                  <label className="block">
                    <span className="mb-1 block text-slate-400">{t('builder.layer.font')}</span>
                    <select
                      value={selected.font}
                      onChange={(e) => updateLayer(selected.id, { font: e.target.value })}
                      className={inputClass}
                      style={{ fontFamily: `"${selected.font}"` }}
                    >
                      {FONTS.map((font) => (
                        <option key={font} value={font} style={{ fontFamily: `"${font}"` }}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                  <RangeRow
                    label={t('builder.layer.size')}
                    display={`${selected.size}`}
                    value={selected.size}
                    min={10}
                    max={200}
                    onChange={(size) => updateLayer(selected.id, { size })}
                  />
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-slate-300">
                      <input
                        type="checkbox"
                        checked={selected.weight >= 700}
                        onChange={(e) => updateLayer(selected.id, { weight: e.target.checked ? 700 : 400 })}
                        className="accent-accent"
                      />
                      {t('builder.layer.bold')}
                    </label>
                    <label className="flex items-center gap-2 text-slate-400">
                      {t('builder.layer.color')}
                      <input
                        type="color"
                        value={selected.color}
                        onChange={(e) => updateLayer(selected.id, { color: e.target.value })}
                        className="h-7 w-10 cursor-pointer rounded border border-line bg-transparent"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-slate-400">
                      {t('builder.layer.strokeColor')}
                      <input
                        type="color"
                        value={selected.strokeColor}
                        onChange={(e) => updateLayer(selected.id, { strokeColor: e.target.value })}
                        className="h-7 w-10 cursor-pointer rounded border border-line bg-transparent"
                      />
                    </label>
                  </div>
                  <RangeRow
                    label={t('builder.layer.stroke')}
                    display={`${selected.stroke}`}
                    value={selected.stroke}
                    min={0}
                    max={12}
                    onChange={(stroke) => updateLayer(selected.id, { stroke })}
                  />
                  <RangeRow
                    label={t('builder.layer.glow')}
                    display={`${selected.glow}`}
                    value={selected.glow}
                    min={0}
                    max={40}
                    onChange={(glow) => updateLayer(selected.id, { glow })}
                  />
                </>
              )}
              <RangeRow
                label={t('builder.layer.scale')}
                display={`${Math.round(selected.scale * 100)}%`}
                value={Math.round(selected.scale * 100)}
                min={2}
                max={400}
                onChange={(value) => updateLayer(selected.id, { scale: value / 100 })}
              />
              <RangeRow
                label={t('builder.layer.rotation')}
                display={`${Math.round(selected.rotation)}°`}
                value={selected.rotation}
                min={-180}
                max={180}
                onChange={(rotation) => updateLayer(selected.id, { rotation })}
              />
              <RangeRow
                label={t('builder.layer.opacity')}
                display={`${Math.round(selected.opacity * 100)}%`}
                value={Math.round(selected.opacity * 100)}
                min={0}
                max={100}
                onChange={(value) => updateLayer(selected.id, { opacity: value / 100 })}
              />
              <div>
                <span className="mb-1 block text-slate-400">{t('builder.layer.animation')}</span>
                <div className="flex flex-wrap gap-1">
                  {ANIMATIONS.map((animation) => (
                    <button
                      key={animation}
                      type="button"
                      onClick={() => updateLayer(selected.id, { animation })}
                      className={chipClass(animation === selected.animation)}
                    >
                      {t(`builder.animations.${animation}`)}
                    </button>
                  ))}
                </div>
              </div>
              {selected.animation !== 'none' && (
                <RangeRow
                  label={t('builder.layer.strength')}
                  display={`${Math.round(selected.strength * 100)}%`}
                  value={Math.round(selected.strength * 100)}
                  min={0}
                  max={100}
                  onChange={(value) => updateLayer(selected.id, { strength: value / 100 })}
                />
              )}
              <p className="text-xs text-slate-500">
                X {Math.round(selected.x)}, Y {Math.round(selected.y)} · {t('builder.layer.hint')}
              </p>
            </div>
          </Section>
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
                        resetResult()
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
                        resetResult()
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
                    resetResult()
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
                    resetResult()
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
          onClick={onExport}
          disabled={(!source && layers.length === 0) || !!busy}
          className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-ink disabled:opacity-50"
        >
          {busyLabel ?? t(animated ? 'cutter.export.gifButton' : 'cutter.export.button')}
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
            {result.thinned && <p className="text-xs text-amber-300/80">{t('cutter.result.thinned')}</p>}
            <button type="button" onClick={sendToPreview} className={`${secondaryButton} w-full`}>
              {t('cutter.result.toPreview')}
            </button>
            <p className="text-xs">
              <Link to={`/${lang}/guide#helper`} className="text-accent hover:underline">
                {t('cutter.upload.helper')}
              </Link>
            </p>
          </div>
        )}
      </aside>

      <section className="relative h-[calc(100vh-9rem)] min-h-[480px] overflow-hidden rounded-xl border border-line bg-panel/40 lg:sticky lg:top-4 lg:self-start">
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
          assets={assets}
          selectedId={selectedId}
          playing={playing && animated}
          redraw={fontsVersion + assetsVersion}
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
