import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_SHOWCASE_HEIGHT, SHOWCASES, hasCounter, type ProfileData, type ShowcaseKind } from '@profile-editor/core'
import ProfileReplica, { type ReplicaBackground } from '../components/ProfileReplica'
import ScaledBox from '../components/ScaledBox'
import { showcaseStore, useShowcaseStore } from '../lib/showcaseStore'
import { THEME_NAMES, themeFromSteam, type ThemeName } from '../lib/themes'
import { useObjectUrl, useObjectUrls } from '../lib/useObjectUrl'

const WIDTHS = [1366, 1600, 1920, 2560]
const KINDS: ShowcaseKind[] = ['artwork', 'featured', 'screenshot', 'workshop']
const KNOWN_ERRORS = ['bad_input', 'not_found', 'steam_unavailable']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  )
}

const inputClass =
  'w-full min-w-0 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent'
const secondaryButton =
  'rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50'
const chipClass = (active: boolean) =>
  `rounded-md border px-2 py-1 text-xs ${active ? 'border-accent bg-accent/10 text-white' : 'border-line text-slate-400 hover:text-white'}`

export default function Preview() {
  const { t } = useTranslation()
  const { showcases, background, tryOn } = useShowcaseStore()

  const [name, setName] = useState(() => t('preview.defaultName'))
  const [level, setLevel] = useState(10)
  const [summary, setSummary] = useState('')
  const [remoteAvatar, setRemoteAvatar] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [frame, setFrame] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeName>('DefaultTheme')
  const [remoteBackground, setRemoteBackground] = useState<ReplicaBackground | null>(null)
  const [useRemoteBackground, setUseRemoteBackground] = useState(false)
  const [fullWidth, setFullWidth] = useState(false)
  const [width, setWidth] = useState(1920)
  const [fit, setFit] = useState(true)
  const [link, setLink] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [addKind, setAddKind] = useState<ShowcaseKind>('artwork')

  const avatarInput = useRef<HTMLInputElement>(null)
  const backgroundInput = useRef<HTMLInputElement>(null)
  const filesInput = useRef<HTMLInputElement>(null)

  // забираем то, что выбрали примерить в каталоге
  useEffect(() => {
    if (!tryOn) return
    if (tryOn.background) {
      setRemoteBackground(tryOn.background)
      setUseRemoteBackground(true)
    }
    if (tryOn.frame) setFrame(tryOn.frame)
    if (tryOn.avatar) {
      setRemoteAvatar(tryOn.avatar)
      setAvatarFile(null)
    }
    if (tryOn.avatarFile) {
      setAvatarFile(tryOn.avatarFile)
      setRemoteAvatar(null)
    }
    showcaseStore.clearTryOn()
  }, [tryOn])

  const avatarFileUrl = useObjectUrl(avatarFile)
  const storeBackgroundUrl = useObjectUrl(background?.blob)
  const blobs = useMemo(() => showcases.flatMap((s) => s.files.map((f) => f.blob)), [showcases])
  const urls = useObjectUrls(blobs)

  const replicaShowcases = useMemo(() => {
    let i = 0
    return showcases.map((s) => ({
      id: s.id,
      kind: s.kind,
      urls: s.files.map(() => urls[i++] ?? ''),
      counter: s.counter,
      height: s.height,
    }))
  }, [showcases, urls])

  const storeBackground: ReplicaBackground | null =
    background && storeBackgroundUrl ? { url: storeBackgroundUrl, isVideo: background.isVideo } : null
  const activeBackground = useRemoteBackground && remoteBackground ? remoteBackground : (storeBackground ?? remoteBackground)

  async function onImport(e: FormEvent) {
    e.preventDefault()
    if (!link.trim()) return
    setImporting(true)
    setImportError(null)
    try {
      const res = await fetch(`/api/steam/profile?id=${encodeURIComponent(link.trim())}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setImportError(KNOWN_ERRORS.includes(body.error) ? body.error : 'unknown')
        return
      }
      const p = body as ProfileData
      if (p.name) setName(p.name)
      if (p.level !== undefined) setLevel(p.level)
      setRemoteAvatar(p.animatedAvatar?.imageSmall ?? p.avatar ?? null)
      setAvatarFile(null)
      // у рамок анимированная версия лежит в маленькой картинке
      setFrame(p.avatarFrame?.imageSmall ?? p.avatarFrame?.image ?? null)
      setTheme(themeFromSteam(p.theme))
      const bg = p.background
      const video = bg?.webm ?? bg?.mp4
      setRemoteBackground(video ? { url: video, isVideo: true } : bg?.image ? { url: bg.image, isVideo: false } : null)
      setUseRemoteBackground(!background)
    } catch {
      setImportError('unknown')
    } finally {
      setImporting(false)
    }
  }

  function onBackgroundFile(file?: File) {
    if (!file) return
    showcaseStore.setBackground({ blob: file, isVideo: file.type.startsWith('video/') })
    setUseRemoteBackground(false)
  }

  function onShowcaseFiles(list: FileList | null) {
    if (!list?.length) return
    const files = Array.from(list)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .slice(0, SHOWCASES[addKind].slices.length)
      .map((file) => ({ name: file.name, blob: file as Blob }))
    showcaseStore.addShowcase(addKind, files)
  }

  const labels = {
    level: t('preview.replica.level'),
    offline: t('preview.replica.offline'),
    showcase: {
      artwork: t('preview.replica.artwork'),
      featured: t('preview.replica.featured'),
      screenshot: t('preview.replica.screenshot'),
      workshop: t('preview.replica.workshop'),
    },
    workshopOwner: t('preview.replica.workshopOwner', { name }),
    counter: t('preview.replica.counter'),
    other: t('kit.other'),
  }

  return (
    <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-8 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-6">
        <h1 className="text-2xl font-semibold text-white">{t('preview.title')}</h1>

        <Section title={t('preview.profile.title')}>
          <form onSubmit={onImport} className="flex gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={t('preview.profile.linkPlaceholder')}
              className={inputClass}
            />
            <button type="submit" disabled={!link.trim() || importing} className={secondaryButton}>
              {importing ? '…' : t('preview.profile.load')}
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500">{t('preview.profile.hint')}</p>
          {importError && <p className="mt-2 text-sm text-red-400">{t(`check.errors.${importError}`)}</p>}

          <div className="mt-4 space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-slate-400">{t('preview.profile.name')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">{t('preview.profile.level')}</span>
              <input
                type="number"
                min={0}
                max={5000}
                value={level}
                onChange={(e) => setLevel(Math.max(0, Number(e.target.value) || 0))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">{t('preview.profile.summary')}</span>
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={inputClass} />
            </label>
            <button type="button" onClick={() => avatarInput.current?.click()} className={secondaryButton}>
              {t('preview.profile.avatar')}
            </button>
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                setAvatarFile(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
            <div>
              <span className="mb-1 block text-slate-400">{t('preview.profile.theme')}</span>
              <div className="flex flex-wrap gap-1">
                {THEME_NAMES.map((name) => (
                  <button key={name} type="button" onClick={() => setTheme(name)} className={chipClass(name === theme)}>
                    {t(`preview.themes.${name}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title={t('preview.background.title')}>
          <div className="space-y-3 text-sm">
            <button type="button" onClick={() => backgroundInput.current?.click()} className={secondaryButton}>
              {t('preview.background.file')}
            </button>
            <input
              ref={backgroundInput}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(e) => {
                onBackgroundFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {storeBackground && remoteBackground && (
              <div className="flex gap-1">
                <button type="button" onClick={() => setUseRemoteBackground(false)} className={chipClass(!useRemoteBackground)}>
                  {t('preview.background.fromCutter')}
                </button>
                <button type="button" onClick={() => setUseRemoteBackground(true)} className={chipClass(useRemoteBackground)}>
                  {t('preview.background.fromProfile')}
                </button>
              </div>
            )}
            <label className="flex items-start gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={fullWidth}
                onChange={(e) => setFullWidth(e.target.checked)}
                className="mt-1 accent-accent"
              />
              <span>
                {t('preview.background.fullWidth')}
                <span className="block text-xs text-slate-500">{t('preview.background.fullWidthHint')}</span>
              </span>
            </label>
            <div>
              <span className="mb-1 block text-slate-400">{t('preview.background.width')}</span>
              <div className="flex gap-1">
                {WIDTHS.map((w) => (
                  <button key={w} type="button" onClick={() => setWidth(w)} className={chipClass(w === width)}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title={t('preview.showcases.title')}>
          {showcases.length === 0 && <p className="mb-3 text-xs text-slate-500">{t('preview.showcases.empty')}</p>}
          <ul className="space-y-2">
            {showcases.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                <span className="flex-1 text-slate-200">
                  {s.kind === 'other' ? t('kit.other') : t(`cutter.kind.${s.kind}`)}
                  {s.kind === 'other' ? (
                    <input
                      type="number"
                      value={s.height ?? 0}
                      min={10}
                      max={4000}
                      aria-label={t('kit.showcases.blockHeight')}
                      onChange={(e) => showcaseStore.setHeight(s.id, Math.max(10, Number(e.target.value) || 0))}
                      className="ml-2 w-16 rounded border border-line bg-ink px-2 py-0.5 text-right text-xs text-white"
                    />
                  ) : (
                    <span className="ml-2 text-xs text-slate-500">{t('preview.showcases.files', { count: s.files.length })}</span>
                  )}
                </span>
                {s.kind !== 'other' && hasCounter(s.kind) && (
                  <button
                    type="button"
                    title={t('preview.showcases.counterHint')}
                    aria-pressed={s.counter !== false}
                    onClick={() => showcaseStore.setCounter(s.id, s.counter === false)}
                    className={chipClass(s.counter !== false)}
                  >
                    +N
                  </button>
                )}
                <button
                  type="button"
                  title={t('preview.showcases.up')}
                  disabled={i === 0}
                  onClick={() => showcaseStore.moveShowcase(s.id, -1)}
                  className="px-1 text-slate-400 hover:text-white disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  title={t('preview.showcases.down')}
                  disabled={i === showcases.length - 1}
                  onClick={() => showcaseStore.moveShowcase(s.id, 1)}
                  className="px-1 text-slate-400 hover:text-white disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  title={t('preview.showcases.remove')}
                  onClick={() => showcaseStore.removeShowcase(s.id)}
                  className="px-1 text-slate-400 hover:text-red-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setAddKind(k)} className={chipClass(k === addKind)}>
                {t(`cutter.kind.${k}`)}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => filesInput.current?.click()} className={`${secondaryButton} mt-2 w-full`}>
            {t('preview.showcases.add')}
          </button>
          <button
            type="button"
            onClick={() => showcaseStore.addOther(DEFAULT_SHOWCASE_HEIGHT.other)}
            className={`${secondaryButton} mt-2 w-full`}
          >
            {t('preview.showcases.addOther')}
          </button>
          <input
            ref={filesInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              onShowcaseFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </Section>
      </aside>

      <section className="relative h-[calc(100vh-9rem)] min-h-[480px] overflow-hidden rounded-xl border border-line bg-black lg:sticky lg:top-4 lg:self-start">
        <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-lg bg-ink/80 p-1 text-sm">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setFit(v)}
              className={`rounded px-3 py-1 ${fit === v ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {v ? t('preview.view.fit') : t('preview.view.actual')}
            </button>
          ))}
        </div>
        <ScaledBox width={width} fit={fit}>
          <ProfileReplica
            width={width}
            fullWidth={fullWidth}
            theme={theme}
            profile={{ name, level, summary, avatar: avatarFileUrl ?? remoteAvatar, frame }}
            background={activeBackground}
            showcases={replicaShowcases}
            labels={labels}
          />
        </ScaledBox>
      </section>
    </div>
  )
}
