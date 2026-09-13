import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProfileData } from '@profile-editor/core'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; code: string }
  | { status: 'done'; profile: ProfileData }

const KNOWN_ERRORS = ['bad_input', 'not_found', 'steam_unavailable']

// Пробуем нарисовать картинку со Steam CDN в canvas и прочитать пиксель.
// Если CDN не отдаёт CORS-заголовки, getImageData упадёт.
function canReadFromCanvas(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 8
        canvas.height = 8
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(false)
        ctx.drawImage(img, 0, 0, 8, 8)
        ctx.getImageData(0, 0, 1, 1)
        resolve(true)
      } catch {
        resolve(false)
      }
    }
    img.onerror = () => resolve(false)
    img.src = src
  })
}

export default function Check() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })
  const [canvasOk, setCanvasOk] = useState<boolean | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setState({ status: 'loading' })
    setCanvasOk(null)
    try {
      const res = await fetch(`/api/steam/profile?id=${encodeURIComponent(input)}`)
      const body = await res.json()
      if (!res.ok) {
        setState({ status: 'error', code: KNOWN_ERRORS.includes(body.error) ? body.error : 'unknown' })
        return
      }
      const profile = body as ProfileData
      setState({ status: 'done', profile })
      if (profile.background?.image) setCanvasOk(await canReadFromCanvas(profile.background.image))
    } catch {
      setState({ status: 'error', code: 'unknown' })
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold text-white">{t('check.title')}</h1>
      <p className="mt-3 text-slate-400">{t('check.hint')}</p>

      <form onSubmit={onSubmit} className="mt-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('check.placeholder')}
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-white outline-none placeholder:text-slate-600 focus:border-accent"
        />
        <button
          type="submit"
          disabled={!input.trim() || state.status === 'loading'}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-ink disabled:opacity-50"
        >
          {state.status === 'loading' ? t('check.loading') : t('check.submit')}
        </button>
      </form>

      {state.status === 'error' && <p className="mt-6 text-red-400">{t(`check.errors.${state.code}`)}</p>}

      {state.status === 'done' && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center gap-4">
            {state.profile.avatar && (
              <img src={state.profile.avatar} alt="" className="size-16 rounded-lg" />
            )}
            <div>
              <div className="text-lg font-medium text-white">{state.profile.name ?? state.profile.steamid}</div>
              <div className="text-sm text-slate-400">
                {state.profile.level !== undefined && `${t('check.level')}: ${state.profile.level}`}
                {state.profile.theme && ` · ${t('check.theme')}: ${state.profile.theme}`}
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm text-slate-400">{t('check.background')}</h2>
            {state.profile.background?.image ? (
              <>
                <img
                  src={state.profile.background.image}
                  alt={state.profile.background.name ?? ''}
                  className="w-full rounded-lg border border-line"
                />
                {canvasOk !== null && (
                  <p className={`mt-2 text-sm ${canvasOk ? 'text-emerald-400' : 'text-red-400'}`}>
                    {canvasOk ? t('check.canvasOk') : t('check.canvasFail')}
                  </p>
                )}
              </>
            ) : (
              <p className="text-slate-500">{t('check.noBackground')}</p>
            )}
          </div>

          <details className="rounded-lg border border-line bg-panel p-4">
            <summary className="cursor-pointer text-sm text-slate-400">{t('check.raw')}</summary>
            <pre className="mt-3 overflow-x-auto text-xs text-slate-300">
              {JSON.stringify(state.profile, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
