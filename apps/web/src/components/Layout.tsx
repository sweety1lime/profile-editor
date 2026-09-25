import { useLayoutEffect } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LANGS, detectLang, isLang } from '../i18n'
import { usePageMeta } from '../lib/meta'
import ErrorBoundary from './ErrorBoundary'

const REPO_URL = 'https://github.com/sweety1lime/profile-editor'

export default function Layout() {
  const { lang } = useParams()
  const { t, i18n } = useTranslation()
  const location = useLocation()

  useLayoutEffect(() => {
    if (!isLang(lang)) return
    if (i18n.language !== lang) i18n.changeLanguage(lang)
    document.documentElement.lang = lang
  }, [lang, i18n])

  usePageMeta(isLang(lang) ? lang : detectLang(), location.pathname)

  if (!isLang(lang)) return <Navigate to={`/${detectLang()}`} replace />

  const withLang = (next: string) => location.pathname.replace(/^\/(ru|en)/, `/${next}`) + location.search
  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'text-white' : 'text-slate-400 hover:text-white'

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        {/* на узком экране меню уходит второй строкой и листается вбок, логотип и языки остаются сверху */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
          <Link to={`/${lang}`} className="font-semibold text-white">
            Profile Editor
          </Link>
          <nav className="order-last -mb-1 flex w-full gap-4 overflow-x-auto whitespace-nowrap pb-1 text-sm lg:order-none lg:mb-0 lg:w-auto lg:pb-0">
            <NavLink to={`/${lang}/cutter`} className={navClass}>
              {t('nav.cutter')}
            </NavLink>
            <NavLink to={`/${lang}/kit`} className={navClass}>
              {t('nav.kit')}
            </NavLink>
            <NavLink to={`/${lang}/builder`} className={navClass}>
              {t('nav.builder')}
            </NavLink>
            <NavLink to={`/${lang}/preview`} className={navClass}>
              {t('nav.preview')}
            </NavLink>
            <NavLink to={`/${lang}/backgrounds`} className={navClass}>
              {t('nav.gallery')}
            </NavLink>
            <NavLink to={`/${lang}/infobox`} className={navClass}>
              {t('nav.infobox')}
            </NavLink>
            <NavLink to={`/${lang}/guide`} className={navClass}>
              {t('nav.guide')}
            </NavLink>
          </nav>
          <div className="ml-auto flex gap-1 text-sm">
            {LANGS.map((l) => (
              <Link
                key={l}
                to={withLang(l)}
                className={`rounded px-2 py-1 uppercase ${
                  l === lang ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {l}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ключ по адресу: уходя со сломавшейся страницы, показываем следующую как обычно */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-x-4 gap-y-1 px-4 py-6 text-sm text-slate-500">
          <span>{t('footer.note')}</span>
          <a href={REPO_URL} className="hover:text-slate-300" target="_blank" rel="noreferrer">
            {t('footer.source')}
          </a>
        </div>
      </footer>
    </div>
  )
}
