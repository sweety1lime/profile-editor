import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource-variable/inter'
import './i18n'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

// После нового деплоя старые куски сборки с сервера пропадают, и вкладка, открытая раньше,
// не может догрузить страницу. Один раз перезагружаемся на свежую сборку, работа лежит в IndexedDB.
// Если и после этого не вышло, ошибку покажет ErrorBoundary
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem('reloadedAt') ?? 0)
  if (Date.now() - last < 10_000) return
  event.preventDefault()
  sessionStorage.setItem('reloadedAt', String(Date.now()))
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
