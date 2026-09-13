import { useTranslation } from 'react-i18next'

const TOOLS = ['cutter', 'optimizer', 'preview', 'backgrounds', 'infobox', 'helper'] as const

export default function Home() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        {t('home.title')}
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-slate-400">{t('home.lead')}</p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((id) => (
          <div key={id} className="rounded-xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium text-white">{t(`home.tools.${id}.title`)}</h2>
              <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                {t('home.soon')}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-400">{t(`home.tools.${id}.text`)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
