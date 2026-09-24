import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { decodePalette, encodePalette, paletteDistance, toLab, type PaletteColor } from '@profile-editor/core'
import PaletteStrip from '../components/PaletteStrip'
import {
  assetUrl,
  loadApps,
  loadKind,
  loadPalettes,
  motionUrl,
  pointsShopUrl,
  thumbUrl,
  type CatalogApps,
  type CatalogItem,
  type CatalogKind,
} from '../lib/catalog'
import { colorToHex, hexToPalette, paletteFromFile } from '../lib/palette'
import { isShopSlot, pendingShop, toPick } from '../lib/kitShop'
import { showcaseStore } from '../lib/showcaseStore'
import { useReducedMotion } from '../lib/useReducedMotion'

const TABS: CatalogKind[] = ['backgrounds', 'mini', 'frames', 'avatars', 'profiles']
const SORTS = ['new', 'cheap', 'expensive'] as const
type Sort = (typeof SORTS)[number]
const PAGE = 60

const isSquare = (kind: CatalogKind) => kind === 'frames' || kind === 'avatars'

const chipClass = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-sm ${
    active ? 'border-accent bg-accent/10 text-white' : 'border-line bg-panel text-slate-400 hover:text-white'
  }`
const actionButton = 'rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-200 hover:border-slate-500'

function ItemMedia({ kind, item }: { kind: CatalogKind; item: CatalogItem }) {
  const motion = motionUrl(kind, item)
  const still = useReducedMotion()
  if ((kind === 'backgrounds' || kind === 'mini') && motion) {
    return (
      <video
        src={motion}
        poster={assetUrl(item, item.i)}
        autoPlay={!still}
        controls={still}
        loop
        muted
        playsInline
        className="w-full rounded-lg"
      />
    )
  }
  if (kind === 'frames') {
    return (
      <div className="relative mx-auto size-56">
        <div className="absolute inset-[26px] rounded-sm bg-slate-600" />
        <img src={motion ?? assetUrl(item, item.i)} alt="" className="absolute inset-0 size-full" />
      </div>
    )
  }
  if (kind === 'avatars') {
    return <img src={motion ?? assetUrl(item, item.i)} alt="" className="mx-auto size-48 rounded-sm" />
  }
  return <img src={assetUrl(item, item.i)} alt="" className="w-full rounded-lg" />
}

function ItemDialog(props: {
  kind: CatalogKind
  item: CatalogItem
  game: string
  palette: PaletteColor[]
  onClose: () => void
  onCut: () => void
  onBuild: () => void
  onTry: (() => void) | null
  // выбираем для комплекта: вещь запоминается вместе с ним
  onPick: (() => void) | null
}) {
  const { t, i18n } = useTranslation()
  const { kind, item, onClose } = props
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  // Нативное окно само уводит фокус внутрь, не выпускает его наружу по Tab, закрывается
  // по Escape и возвращает фокус туда, откуда его открыли
  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
    return () => el?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      // клик мимо окна приходит на сам dialog: всё, что внутри, целится в свои элементы
      onClick={(e) => {
        if (e.target === dialog.current) onClose()
      }}
      className="m-auto max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-line bg-ink p-5 text-slate-200 backdrop:bg-black/75"
    >
      <div>
        <ItemMedia kind={kind} item={item} />
        {props.palette.length > 0 && <PaletteStrip palette={props.palette} className="mt-3 h-3 w-full" />}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-medium text-white">
              {item.n}
            </h2>
            <p className="text-sm text-slate-400">{props.game}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t('gallery.points', { points: item.p.toLocaleString(i18n.language) })}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-white">
            {t('gallery.close')}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={pointsShopUrl(item)} target="_blank" rel="noreferrer" className={actionButton}>
            {t('gallery.openShop')}
          </a>
          {kind === 'backgrounds' && (
            <>
              <button type="button" onClick={props.onCut} className={actionButton}>
                {t('gallery.cut')}
              </button>
              <button type="button" onClick={props.onBuild} className={actionButton}>
                {t('gallery.build')}
              </button>
            </>
          )}
          {props.onTry && (
            <button
              type="button"
              onClick={props.onTry}
              className={props.onPick ? actionButton : 'rounded-lg bg-accent px-3 py-2 text-sm font-medium text-ink'}
            >
              {t('gallery.tryOn')}
            </button>
          )}
          {props.onPick && (
            <button type="button" onClick={props.onPick} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-ink">
              {t('gallery.toKit')}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}

export default function Gallery() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { lang } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  // из комплекта приходим сразу на нужную вкладку
  const [kind, setKind] = useState<CatalogKind>(() => {
    const wanted = searchParams.get('kind')
    return TABS.find((tab) => tab === wanted) ?? 'backgrounds'
  })
  const forKit = searchParams.get('for') === 'kit'
  const [items, setItems] = useState<CatalogItem[] | null>(null)
  // пока не знаем, какие игры для взрослых, каталог не показываем
  const [apps, setApps] = useState<CatalogApps | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [animatedOnly, setAnimatedOnly] = useState(false)
  const [showAdult, setShowAdult] = useState(false)
  const [sort, setSort] = useState<Sort>('new')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<CatalogItem | null>(null)
  const [palettes, setPalettes] = useState<string[] | null>(null)
  const [paletteFailed, setPaletteFailed] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const paletteInput = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query)

  // палитра для подбора живёт в адресе, так ссылкой можно поделиться
  const paletteParam = useDeferredValue(searchParams.get('palette') ?? '')
  const palette = useMemo(() => decodePalette(paletteParam), [paletteParam])
  const colorMode = kind === 'backgrounds' && palette.length > 0

  function setPalette(next: PaletteColor[]) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next.length) params.set('palette', encodePalette(next))
        else params.delete('palette')
        return params
      },
      { replace: true },
    )
  }

  useEffect(() => {
    loadApps()
      .then(setApps)
      .catch(() => setApps({ names: {}, adult: new Set() }))
  }, [])

  useEffect(() => {
    let alive = true
    setItems(null)
    setFailed(false)
    loadKind(kind)
      .then((list) => alive && setItems(list))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [kind])

  useEffect(() => {
    if (!colorMode || palettes) return
    loadPalettes('backgrounds')
      .then(setPalettes)
      .catch(() => setPaletteFailed(true))
  }, [colorMode, palettes])

  useEffect(() => {
    setLimit(PAGE)
  }, [kind, deferredQuery, animatedOnly, showAdult, sort, paletteParam])

  const gameName = (item: CatalogItem) => apps?.names[item.a] ?? t('gallery.app', { id: item.a })
  const ready = items && apps

  // палитры идут в том же порядке, что и фоны, поэтому связываем их по номеру
  const indexById = useMemo(() => new Map((items ?? []).map((item, i) => [item.d, i])), [items])
  const itemLabs = useMemo(() => palettes?.map((text) => toLab(decodePalette(text))) ?? null, [palettes])
  const scores = useMemo(() => {
    if (!colorMode || !itemLabs || !items || itemLabs.length !== items.length) return null
    const target = toLab(palette)
    return itemLabs.map((lab) => paletteDistance(target, lab))
  }, [colorMode, itemLabs, items, palette])

  const filtered = useMemo(() => {
    if (!items || !apps) return []
    const q = deferredQuery.trim().toLowerCase()
    let list = animatedOnly ? items.filter((it) => it.an) : items
    if (!showAdult) list = list.filter((it) => !apps.adult.has(it.a))
    if (q) list = list.filter((it) => it.n.toLowerCase().includes(q) || (apps.names[it.a] ?? '').toLowerCase().includes(q))
    const sorted = [...list]
    if (scores) {
      const score = (it: CatalogItem) => scores[indexById.get(it.d) ?? -1] ?? Infinity
      sorted.sort((a, b) => score(a) - score(b))
    } else if (sort === 'new') sorted.sort((a, b) => b.t - a.t || b.d - a.d)
    else if (sort === 'cheap') sorted.sort((a, b) => a.p - b.p)
    else sorted.sort((a, b) => b.p - a.p)
    return sorted
  }, [items, deferredQuery, animatedOnly, showAdult, sort, apps, scores, indexById])

  // подгружаем следующую порцию, когда долистали до конца
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setLimit((l) => l + PAGE)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [items])

  const itemPalette = (item: CatalogItem): PaletteColor[] => {
    if (kind !== 'backgrounds' || !palettes) return []
    return decodePalette(palettes[indexById.get(item.d) ?? -1] ?? '')
  }

  function openWith(page: 'cutter' | 'builder', item: CatalogItem) {
    const src = assetUrl(item, item.w ?? item.i)
    navigate(`/${lang}/${page}?src=${encodeURIComponent(src)}`)
  }

  function tryOnAction(item: CatalogItem): (() => void) | null {
    const go = () => navigate(`/${lang}/preview`)
    if (kind === 'backgrounds') {
      const video = item.w ?? item.m
      return () => {
        showcaseStore.tryOn({ background: { url: assetUrl(item, video ?? item.i), isVideo: !!video } })
        go()
      }
    }
    if (kind === 'frames') {
      return () => {
        showcaseStore.tryOn({ frame: assetUrl(item, item.s ?? item.i) })
        go()
      }
    }
    if (kind === 'avatars') {
      return () => {
        showcaseStore.tryOn({ avatar: assetUrl(item, item.s ?? item.i) })
        go()
      }
    }
    return null
  }

  function pickAction(item: CatalogItem): (() => void) | null {
    if (!forKit || !isShopSlot(kind)) return null
    const slot = kind
    return () => {
      pendingShop.put(slot, toPick(slot, item))
      navigate(`/${lang}/kit`)
    }
  }

  async function onPaletteFile(file?: File) {
    if (!file) return
    const next = await paletteFromFile(file).catch(() => [])
    if (next.length) setPalette(next)
  }

  const square = isSquare(kind)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-white">{t('gallery.title')}</h1>
      <p className="mt-2 max-w-2xl text-slate-400">{t('gallery.lead')}</p>
      {forKit && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-slate-200">
          <span>{t('gallery.forKit')}</span>
          <Link to={`/${lang}/kit`} className="text-accent hover:underline">
            {t('gallery.backToKit')}
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button key={tab} type="button" onClick={() => setKind(tab)} className={chipClass(tab === kind)}>
            {t(`gallery.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('gallery.search')}
          className="w-72 max-w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent"
        />
        {kind !== 'profiles' && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={animatedOnly} onChange={(e) => setAnimatedOnly(e.target.checked)} className="accent-accent" />
            {t('gallery.animatedOnly')}
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={showAdult} onChange={(e) => setShowAdult(e.target.checked)} className="accent-accent" />
          {t('gallery.showAdult')}
        </label>
        {colorMode ? (
          <span className="text-sm text-slate-400">{t('gallery.match.sorted')}</span>
        ) : (
          <div className="flex gap-1">
            {SORTS.map((s) => (
              <button key={s} type="button" onClick={() => setSort(s)} className={chipClass(s === sort)}>
                {t(`gallery.sort.${s}`)}
              </button>
            ))}
          </div>
        )}
        {ready && <span className="text-sm text-slate-500">{t('gallery.count', { count: filtered.length })}</span>}
      </div>

      {kind === 'backgrounds' && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel/60 px-3 py-2">
          <span className="text-sm text-slate-300">{t('gallery.match.title')}</span>
          <button type="button" onClick={() => paletteInput.current?.click()} className={chipClass(false)}>
            {t('gallery.match.upload')}
          </button>
          <input
            ref={paletteInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              onPaletteFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <label className="flex items-center gap-2 text-sm text-slate-400">
            {t('gallery.match.color')}
            <input
              type="color"
              value={palette[0] ? colorToHex(palette[0]) : '#7c9cff'}
              onChange={(e) => setPalette(hexToPalette(e.target.value))}
              className="h-7 w-10 cursor-pointer rounded border border-line bg-transparent"
            />
          </label>
          {colorMode && <PaletteStrip palette={palette} className="h-6 w-40" />}
          {colorMode && (
            <button type="button" onClick={() => setPalette([])} className="text-sm text-slate-400 hover:text-white">
              {t('gallery.match.reset')}
            </button>
          )}
          {colorMode && !palettes && !paletteFailed && <span className="text-xs text-slate-500">{t('gallery.match.loading')}</span>}
          {colorMode && paletteFailed && <span className="text-xs text-red-400">{t('gallery.match.error')}</span>}
        </div>
      )}

      {failed && <p className="mt-8 text-red-400">{t('gallery.error')}</p>}
      {!ready && !failed && <p className="mt-8 text-slate-500">{t('gallery.loading')}</p>}
      {ready && filtered.length === 0 && <p className="mt-8 text-slate-500">{t('gallery.empty')}</p>}

      <div
        className={`mt-6 grid gap-3 ${
          square ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
        }`}
      >
        {filtered.slice(0, limit).map((item) => (
          <button
            key={item.d}
            type="button"
            data-catalog-item
            onClick={() => setSelected(item)}
            className="group relative overflow-hidden rounded-lg border border-line bg-panel text-left transition-colors hover:border-accent"
          >
            <img
              src={thumbUrl(kind, item)}
              alt=""
              loading="lazy"
              className={square ? 'aspect-square w-full object-contain p-2' : 'aspect-[16/10] w-full object-cover'}
            />
            {colorMode && <PaletteStrip palette={itemPalette(item)} className="h-1.5 w-full rounded-none" />}
            {item.an && (
              <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-200">
                {t('gallery.animated')}
              </span>
            )}
            <div className="p-2">
              <div className="truncate text-sm text-white">{item.n}</div>
              <div className="truncate text-xs text-slate-500">{gameName(item)}</div>
            </div>
          </button>
        ))}
      </div>
      <div ref={sentinel} className="h-10" />

      {selected && (
        <ItemDialog
          kind={kind}
          item={selected}
          game={gameName(selected)}
          palette={itemPalette(selected)}
          onClose={() => setSelected(null)}
          onCut={() => openWith('cutter', selected)}
          onBuild={() => openWith('builder', selected)}
          onTry={tryOnAction(selected)}
          onPick={pickAction(selected)}
        />
      )}
    </div>
  )
}
