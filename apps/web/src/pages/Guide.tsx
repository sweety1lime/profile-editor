import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { zipSync } from 'fflate'
import { UPLOAD_PAGE, UPLOAD_SNIPPETS, isGif, patchGifTrailer, type ShowcaseKind } from '@profile-editor/core'
import CopyButton from '../components/CopyButton'
import { download } from '../lib/exportSlices'

const SECTIONS: { id: string; kind: ShowcaseKind }[] = [
  { id: 'artwork', kind: 'artwork' },
  { id: 'screenshot', kind: 'screenshot' },
  { id: 'workshop', kind: 'workshop' },
]

function HexTool() {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState<{ name: string; ok: boolean }[] | null>(null)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    const patched: Record<string, Uint8Array> = {}
    const lines: { name: string; ok: boolean }[] = []
    for (const file of Array.from(files)) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const ok = isGif(bytes)
      lines.push({ name: file.name, ok })
      if (ok) patched[file.name] = patchGifTrailer(bytes)
    }
    setReport(lines)
    const names = Object.keys(patched)
    if (names.length === 1) {
      download(new Blob([patched[names[0]!] as BlobPart], { type: 'image/gif' }), names[0]!)
    } else if (names.length > 1) {
      download(new Blob([zipSync(patched, { level: 0 }) as BlobPart], { type: 'application/zip' }), 'hex.zip')
    }
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-6">
      <h2 className="text-lg font-medium text-white">{t('guide.hex.title')}</h2>
      <p className="mt-2 text-sm text-slate-400">{t('guide.hex.text')}</p>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink"
      >
        {t('guide.hex.pick')}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/gif"
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {report && (
        <ul className="mt-4 space-y-1 text-sm">
          {report.map((r) => (
            <li key={r.name} className={r.ok ? 'text-slate-300' : 'text-red-400'}>
              {r.name} {r.ok ? '✓' : `— ${t('guide.hex.notGif')}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function Guide() {
  const { t } = useTranslation()
  const list = (key: string) => t(key, { returnObjects: true }) as string[]

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold text-white">{t('guide.title')}</h1>
        <p className="mt-3 text-slate-400">{t('guide.lead')}</p>
      </div>

      <section id="helper" className="rounded-xl border border-accent/40 bg-accent/5 p-6">
        <h2 className="text-lg font-medium text-white">{t('guide.helper.title')}</h2>
        <p className="mt-2 text-sm text-slate-300">{t('guide.helper.text')}</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          {list('guide.helper.steps').map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <a
          href="/profile-editor.user.js"
          className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink"
        >
          {t('guide.helper.install')}
        </a>
        <p className="mt-3 text-xs text-slate-500">{t('guide.helper.note')}</p>
      </section>

      <section>
        <h2 className="text-lg font-medium text-white">{t('guide.before.title')}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          {list('guide.before.items').map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-400">{t('guide.console')}</p>
      </section>

      {SECTIONS.map(({ id, kind }) => (
        <section key={id} className="rounded-xl border border-line bg-panel p-6">
          <h2 className="text-lg font-medium text-white">{t(`guide.${id}.title`)}</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
            {list(`guide.${id}.steps`).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="mt-4 text-xs uppercase tracking-wide text-slate-500">{t('guide.code')}</div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 text-xs text-slate-300">{UPLOAD_SNIPPETS[kind]}</pre>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CopyButton text={UPLOAD_SNIPPETS[kind]} />
            <a href={UPLOAD_PAGE} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
              {t('guide.openPage')}
            </a>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t(`guide.${id}.note`)}</p>
        </section>
      ))}

      <HexTool />

      <section>
        <h2 className="text-lg font-medium text-white">{t('guide.missing.title')}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          {list('guide.missing.items').map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
