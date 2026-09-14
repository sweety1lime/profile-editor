import { Navigate, Route, Routes } from 'react-router'
import { useTranslation } from 'react-i18next'
import Layout from './components/Layout'
import Home from './pages/Home'
import Cutter from './pages/Cutter'
import Preview from './pages/Preview'
import Guide from './pages/Guide'
import Gallery from './pages/Gallery'
import Check from './pages/Check'
import { detectLang } from './i18n'

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
        <Route path="preview" element={<Preview />} />
        <Route path="backgrounds" element={<Gallery />} />
        <Route path="guide" element={<Guide />} />
        <Route path="check" element={<Check />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
