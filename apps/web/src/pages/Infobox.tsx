import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { INFOBOX_LIMIT, TEXT_STYLES, centerLines, countChars, styleText, toBraille } from '@profile-editor/core'
import BBPreview from '../components/BBPreview'
import CopyButton from '../components/CopyButton'

// ширина текста в витрине: колонка 632 px минус отступы подложки по 8 px
const INFOBOX_WIDTH = 616
const STEAM_FONT = '13px "Motiva Sans", Arial, sans-serif'
const INVISIBLE = 'ㅤ'

let measureContext: CanvasRenderingContext2D | null = null
// ширина строки так, как её нарисует Steam; теги не видны, их не считаем
function measure(line: string): number {
  measureContext ??= document.createElement('canvas').getContext('2d')
  const clean = line.replace(/\[\/?[a-z0-9*]+(?:=[^\]]*)?\]/gi, '')
  if (!measureContext) return clean.length * 7
  measureContext.font = STEAM_FONT
  return measureContext.measureText(clean).width
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="text-lg font-medium text-white">{title}</h2>
      {children}
    </section>
  )
}

const toolButton = 'rounded-md border border-line bg-ink px-2.5 py-1 text-sm text-slate-300 hover:border-slate-500 hover:text-white'

function BrailleCard({ onInsert }: { onInsert: (art: string) => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState<ImageBitmap | null>(null)
  const [cols, setCols] = useState(47)
  const [threshold, setThreshold] = useState(128)
  const [invert, setInvert] = useState(true)
  const [dither, setDither] = useState(true)

  const art = useMemo(() => {
    if (!image) return ''
    const width = cols * 2
    const maxRows = Math.floor(INFOBOX_LIMIT / (cols + 1))
    const rows = Math.min(maxRows, Math.max(1, Math.round((width * image.height) / image.width / 4)))
    const height = rows * 4
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return ''
    // прозрачные места считаем белыми, чтобы они не превращались в точки
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)
    const data = ctx.getImageData(0, 0, width, height).data
    const gray = new Uint8Array(width * height)
    for (let i = 0; i < gray.length; i++) {
      gray[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!
    }
    return toBraille(gray, width, height, { threshold, invert, dither })
  }, [image, cols, threshold, invert, dither])

  const rows = art ? art.split('\n').length : 0

  async function onFile(file?: File) {
    if (!file) return
    const next = await createImageBitmap(file).catch(() => null)
    if (!next) return
    image?.close()
    setImage(next)
  }

  return (
    <Card title={t('infobox.braille.title')}>
      <p className="mt-2 text-sm text-slate-400">{t('infobox.braille.text')}</p>
      <button type="button" onClick={() => input.current?.click()} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink">
        {t('infobox.braille.pick')}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {image && (
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <div className="mb-1 flex justify-between text-slate-400">
              <span>{t('infobox.braille.width')}</span>
              <span className="text-white">{cols}</span>
            </div>
            <input type="range" min={16} max={80} value={cols} onChange={(e) => setCols(Number(e.target.value))} className="w-full accent-accent" />
          </label>
          <label className="block">
            <div className="mb-1 flex justify-between text-slate-400">
              <span>{t('infobox.braille.threshold')}</span>
              <span className="text-white">{threshold}</span>
            </div>
            <input type="range" min={1} max={254} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-accent" />
          </label>
          <label className="flex items-start gap-2 text-slate-300">
            <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} className="mt-1 accent-accent" />
            <span>
              {t('infobox.braille.invert')}
              <span className="block text-xs text-slate-500">{t('infobox.braille.invertHint')}</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={dither} onChange={(e) => setDither(e.target.checked)} className="accent-accent" />
            {t('infobox.braille.dither')}
          </label>
          <pre className="max-h-96 overflow-auto rounded-lg bg-[#1b2838] p-3 text-[13px] leading-[18px] text-[#c6d4df]" data-braille>
            {art}
          </pre>
          <p className="text-xs text-slate-500">{t('infobox.braille.size', { cols, rows })}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onInsert(art)} className={toolButton}>
              {t('infobox.braille.insert')}
            </button>
            <CopyButton text={art} label={t('common.copyText')} />
          </div>
        </div>
      )}
    </Card>
  )
}

function NickCard() {
  const { t } = useTranslation()
  const [nick, setNick] = useState('Profile Editor')

  return (
    <Card title={t('infobox.nick.title')}>
      <p className="mt-2 text-sm text-slate-400">{t('infobox.nick.text')}</p>
      <input
        value={nick}
        onChange={(e) => setNick(e.target.value)}
        placeholder={t('infobox.nick.placeholder')}
        className="mt-4 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-white outline-none focus:border-accent"
      />
      <ul className="mt-4 space-y-2">
        {TEXT_STYLES.map((style) => {
          const value = styleText(nick, style)
          return (
            <li key={style} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-slate-500">{t(`infobox.styles.${style}`)}</span>
              <span className="min-w-0 flex-1 truncate text-white">{value}</span>
              <CopyButton text={value} label={t('common.copyText')} className="shrink-0 py-1" />
            </li>
          )
        })}
        <li className="flex items-center gap-3 border-t border-line pt-3">
          <span className="w-28 shrink-0 text-xs text-slate-500">{t('infobox.nick.invisible')}</span>
          <span className="min-w-0 flex-1 text-xs text-slate-500">{t('infobox.nick.invisibleHint')}</span>
          <CopyButton text={INVISIBLE} label={t('common.copyText')} className="shrink-0 py-1" />
        </li>
      </ul>
    </Card>
  )
}

export default function Infobox() {
  const { t } = useTranslation()
  const area = useRef<HTMLTextAreaElement>(null)
  const [title, setTitle] = useState(() => t('infobox.defaultTitle'))
  const [text, setText] = useState(() => t('infobox.sample'))
  const count = countChars(text)

  // заменяет выделенный кусок и оставляет выделенным то, что вставили
  function edit(transform: (selected: string) => string) {
    const el = area.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const inserted = transform(text.slice(start, end))
    setText(text.slice(0, start) + inserted + text.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start, start + inserted.length)
    })
  }

  const wrap = (tag: string, value?: string) =>
    edit((selected) => `[${tag}${value === undefined ? '' : `=${value}`}]${selected}[/${tag}]`)

  function center() {
    const el = area.current
    if (el && el.selectionStart !== el.selectionEnd) edit((selected) => centerLines(selected, measure, INFOBOX_WIDTH))
    else setText(centerLines(text, measure, INFOBOX_WIDTH))
  }

  const tools: { id: string; label: string; run: () => void }[] = [
    { id: 'b', label: 'B', run: () => wrap('b') },
    { id: 'i', label: 'I', run: () => wrap('i') },
    { id: 'u', label: 'U', run: () => wrap('u') },
    { id: 'strike', label: 'S', run: () => wrap('strike') },
    { id: 'h1', label: 'H1', run: () => wrap('h1') },
    { id: 'h2', label: 'H2', run: () => wrap('h2') },
    { id: 'h3', label: 'H3', run: () => wrap('h3') },
    { id: 'spoiler', label: t('infobox.tools.spoiler'), run: () => wrap('spoiler') },
    { id: 'url', label: t('infobox.tools.url'), run: () => wrap('url', 'https://') },
    {
      id: 'list',
      label: t('infobox.tools.list'),
      run: () =>
        edit((selected) => `[list]\n${(selected || t('infobox.item')).split('\n').map((line) => `[*]${line}`).join('\n')}\n[/list]`),
    },
    { id: 'quote', label: t('infobox.tools.quote'), run: () => wrap('quote') },
    { id: 'code', label: t('infobox.tools.code'), run: () => wrap('code') },
    { id: 'hr', label: t('infobox.tools.hr'), run: () => edit((selected) => `${selected}[hr][/hr]`) },
    {
      id: 'table',
      label: t('infobox.tools.table'),
      run: () => {
        const head = t('infobox.tableHead')
        const cell = t('infobox.tableCell')
        edit(() => `[table]\n[tr][th]${head}[/th][th]${head}[/th][/tr]\n[tr][td]${cell}[/td][td]${cell}[/td][/tr]\n[/table]`)
      },
    },
    { id: 'center', label: t('infobox.tools.center'), run: center },
  ]

  function insertArt(art: string) {
    edit((selected) => `${selected}${selected && !selected.endsWith('\n') ? '\n' : ''}${art}`)
    area.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('infobox.title')}</h1>
        <p className="mt-2 max-w-2xl text-slate-400">{t('infobox.lead')}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_680px]">
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('infobox.showcaseTitle')}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-1">
            {tools.map((tool) => (
              <button key={tool.id} type="button" title={t(`infobox.tools.${tool.id}`)} onClick={tool.run} className={toolButton}>
                {tool.label}
              </button>
            ))}
            <button type="button" onClick={() => setText('')} className={`${toolButton} ml-auto`}>
              {t('infobox.tools.clear')}
            </button>
          </div>
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('infobox.placeholder')}
            spellCheck={false}
            className="h-96 w-full resize-y rounded-lg border border-line bg-panel p-3 font-mono text-sm text-white outline-none focus:border-accent"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className={count > INFOBOX_LIMIT ? 'text-red-400' : 'text-slate-500'}>
              {t('infobox.counter', { count, limit: INFOBOX_LIMIT })}
              {count > INFOBOX_LIMIT && ` · ${t('infobox.tooLong')}`}
            </span>
            <CopyButton text={text} label={t('common.copyText')} />
          </div>
          <p className="text-xs text-slate-500">{t('infobox.centerHint')}</p>
        </div>

        <div>
          <div className="overflow-hidden rounded-lg" style={{ background: '#1b2838' }} data-infobox-preview>
            <div className="mx-auto" style={{ width: 652, maxWidth: '100%', background: 'rgba(0, 0, 0, 0.3)' }}>
              <div
                style={{
                  height: 40,
                  padding: '5px 10px',
                  fontSize: 16,
                  lineHeight: '30px',
                  color: '#fff',
                  background: 'linear-gradient(90deg, rgba(115, 173, 184, 0.247) 0%, rgba(43, 45, 68, 0.93) 90%)',
                }}
              >
                {title}
              </div>
              <div style={{ padding: '20px 10px 11px' }}>
                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: 8, borderRadius: 5, maxHeight: 600, overflowY: 'auto' }}>
                  <BBPreview text={text} />
                </div>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('infobox.heightNote')}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BrailleCard onInsert={insertArt} />
        <NickCard />
      </div>
    </div>
  )
}
