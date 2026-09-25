import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useTranslation } from 'react-i18next'
import Layout from './components/Layout'
import Home from './pages/Home'
import { detectLang } from './i18n'

// Каждый инструмент грузится, только когда на него зашли: тому, кто открыл каталог,
// не нужно качать конструктор. Главная приходит сразу вместе с сайтом
const Cutter = lazy(() => import('./pages/Cutter'))
const Kit = lazy(() => import('./pages/Kit'))
const Preview = lazy(() => import('./pages/Preview'))
const Guide = lazy(() => import('./pages/Guide'))
const Gallery = lazy(() => import('./pages/Gallery'))
const Infobox = lazy(() => import('./pages/Infobox'))
const Builder = lazy(() => import('./pages/Builder'))
const Check = lazy(() => import('./pages/Check'))

function NotFound() {
  const { t } = useTranslation()
  return <p className="mx-auto max-w-5xl px-4 py-16 text-slate-400">{t('notFound')}</p>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/${detectLang()}`} replace />} />
      <Route path="/:lang" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="cutter" element={<Cutter />} />
        <Route path="kit" element={<Kit />} />
        <Route path="builder" element={<Builder />} />
        <Route path="preview" element={<Preview />} />
        <Route path="backgrounds" element={<Gallery />} />
        <Route path="infobox" element={<Infobox />} />
        <Route path="guide" element={<Guide />} />
        <Route path="check" element={<Check />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
