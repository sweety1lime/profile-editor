import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'

const TOOLS = [
  { id: 'cutter', path: 'cutter' },
  { id: 'builder', path: 'builder' },
  { id: 'optimizer', path: 'cutter' },
  { id: 'preview', path: 'preview' },
  { id: 'backgrounds', path: 'backgrounds' },
  { id: 'infobox', path: 'infobox' },
  { id: 'helper', path: 'guide' },
]

export default function Home() {
  const { t } = useTranslation()
  const { lang } = useParams()

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">{t('home.title')}</h1>
      <p className="mt-5 max-w-2xl text-lg text-slate-400">{t('home.lead')}</p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.id}
            to={`/${lang}/${tool.path}`}
            className="rounded-xl border border-line bg-panel p-5 transition-colors hover:border-accent"
          >
            <h2 className="font-medium text-white">{t(`home.tools.${tool.id}.title`)}</h2>
            <p className="mt-2 text-sm text-slate-400">{t(`home.tools.${tool.id}.text`)}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
