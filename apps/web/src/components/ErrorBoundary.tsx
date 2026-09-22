import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Одна упавшая страница не должна уносить весь сайт. Проекты конструктора и работа нарезчика
// лежат в IndexedDB, поэтому после перезагрузки они вернутся сами

function Fallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-white">{t('crash.title')}</h1>
      <p className="mt-3 text-slate-400">{t('crash.text')}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="rounded-lg bg-accent px-4 py-2 font-medium text-ink">
          {t('crash.retry')}
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-line bg-panel px-4 py-2 text-slate-200 hover:border-slate-500"
        >
          {t('crash.reload')}
        </button>
      </div>
      <details className="mt-6 rounded-lg border border-line bg-panel p-4">
        <summary className="cursor-pointer text-sm text-slate-400">{t('crash.details')}</summary>
        <pre className="mt-3 overflow-x-auto text-xs text-slate-300">{error.message || String(error)}</pre>
      </details>
    </div>
  )
}

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('page crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return <Fallback error={error} onRetry={() => this.setState({ error: null })} />
  }
}
