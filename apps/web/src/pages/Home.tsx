import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'

const TOOLS = [
  { id: 'cutter', path: 'cutter' },
  { id: 'optimizer' },
  { id: 'preview', path: 'preview' },
  { id: 'backgrounds', path: 'backgrounds' },
  { id: 'infobox', path: 'infobox' },
  { id: 'helper', path: 'guide' },
] as const

export default function Home() {
  const { t } = useTranslation()
  const { lang } = useParams()

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        {t('home.title')}
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-slate-400">{t('home.lead')}</p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-medium text-white">{t(`home.tools.${tool.id}.title`)}</h2>
                {!('path' in tool) && (
                  <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                    {t('home.soon')}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-400">{t(`home.tools.${tool.id}.text`)}</p>
            </>
          )
          return 'path' in tool ? (
            <Link
              key={tool.id}
              to={`/${lang}/${tool.path}`}
              className="rounded-xl border border-line bg-panel p-5 transition-colors hover:border-accent"
            >
              {body}
            </Link>
          ) : (
            <div key={tool.id} className="rounded-xl border border-line bg-panel p-5 opacity-70">
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}
