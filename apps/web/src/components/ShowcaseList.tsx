import { useTranslation } from 'react-i18next'
import { clampHeight, hasCounter, kitItem, type KitItem, type ShowcaseKind } from '@profile-editor/core'
import { chipClass } from './controls'

const KINDS: ShowcaseKind[] = ['artwork', 'featured', 'screenshot', 'workshop']

interface Props {
  items: KitItem[]
  onChange: (items: KitItem[]) => void
  // чтобы страница успела подстроить своё под новую витрину
  onAdd?: (kind: ShowcaseKind) => void
}

// Список витрин комплекта: порядок и высоты должны совпадать с профилем, иначе арт разъедется
export default function ShowcaseList({ items, onChange, onAdd }: Props) {
  const { t } = useTranslation()

  function setHeight(id: string, height: number) {
    onChange(items.map((item) => (item.id === id ? { ...item, height: clampHeight(height) } : item)))
  }

  function setCounter(id: string, counter: boolean) {
    onChange(items.map((item) => (item.id === id ? { ...item, counter } : item)))
  }

  function move(id: string, delta: number) {
    const from = items.findIndex((item) => item.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= items.length) return
    const next = [...items]
    next.splice(to, 0, ...next.splice(from, 1))
    onChange(next)
  }

  function add(kind: ShowcaseKind) {
    onChange([...items, kitItem(kind)])
    onAdd?.(kind)
  }

  return (
    <div>
      {items.length === 0 && <p className="mb-2 text-xs text-slate-500">{t('kit.showcases.empty')}</p>}
      <ul className="space-y-2" data-showcases>
        {items.map((item, index) => (
          <li key={item.id} className="rounded-lg border border-line bg-panel p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{index + 1}</span>
              <span className="flex-1 text-sm text-white">{t(`cutter.kind.${item.kind}`)}</span>
              <button
                type="button"
                onClick={() => move(item.id, -1)}
                disabled={index === 0}
                title={t('kit.showcases.up')}
                aria-label={t('kit.showcases.up')}
                className="px-1 text-slate-400 hover:text-white disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(item.id, 1)}
                disabled={index === items.length - 1}
                title={t('kit.showcases.down')}
                aria-label={t('kit.showcases.down')}
                className="px-1 text-slate-400 hover:text-white disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onChange(items.filter((other) => other.id !== item.id))}
                title={t('kit.showcases.remove')}
                aria-label={t('kit.showcases.remove')}
                className="px-1 text-slate-400 hover:text-red-400"
              >
                ✕
              </button>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <span>{t('kit.showcases.height')}</span>
              <input
                type="range"
                min={50}
                max={1000}
                value={item.height}
                onChange={(e) => setHeight(item.id, Number(e.target.value))}
                className="flex-1 accent-accent"
              />
              <input
                type="number"
                value={item.height}
                min={50}
                max={4000}
                onChange={(e) => setHeight(item.id, Number(e.target.value) || 0)}
                className="w-16 rounded border border-line bg-ink px-2 py-0.5 text-right text-white"
              />
            </label>
            {hasCounter(item.kind) && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={item.counter ?? true}
                  onChange={(e) => setCounter(item.id, e.target.checked)}
                  className="accent-accent"
                />
                {t('kit.showcases.counter')}
              </label>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1">
        {KINDS.map((kind) => (
          <button key={kind} type="button" onClick={() => add(kind)} className={chipClass(false)}>
            + {t(`cutter.kind.${kind}`)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">{t('kit.showcases.hint')}</p>
      <p className="mt-1 text-xs text-slate-500">{t('kit.showcases.counterHint')}</p>
    </div>
  )
}
