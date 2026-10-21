import { useTranslation } from 'react-i18next'
import type { Layer } from '@profile-editor/core'

const layerIcon = { text: 'T', image: '▣', effect: '✦' }

// слои сверху вниз в том порядке, в каком они лежат на холсте: верхний слой первым
export default function LayerList(props: {
  layers: Layer[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggle: (layer: Layer) => void
  onMove: (id: string, delta: 1 | -1) => void
  onRemove: (id: string) => void
}) {
  const { t } = useTranslation()

  const label = (layer: Layer) => {
    if (layer.type === 'text') return layer.text.split('\n')[0] || '…'
    if (layer.type === 'effect') return t(`builder.effects.${layer.effect}`)
    return layer.name
  }

  return (
    <ul className="mt-3 space-y-1" data-layers>
      {[...props.layers].reverse().map((layer) => (
        <li
          key={layer.id}
          className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
            layer.id === props.selectedId ? 'border-accent bg-accent/10' : 'border-line bg-panel'
          }`}
        >
          <button
            type="button"
            onClick={() => props.onSelect(layer.id)}
            className="min-w-0 flex-1 truncate text-left text-slate-200"
          >
            <span className="mr-2 text-xs text-slate-500">{layerIcon[layer.type]}</span>
            {label(layer)}
          </button>
          <button
            type="button"
            title={t(layer.visible ? 'builder.layers.hide' : 'builder.layers.show')}
            aria-label={t(layer.visible ? 'builder.layers.hide' : 'builder.layers.show')}
            onClick={() => props.onToggle(layer)}
            className={`px-1 ${layer.visible ? 'text-slate-400' : 'text-slate-600'} hover:text-white`}
          >
            {layer.visible ? '◉' : '○'}
          </button>
          <button
            type="button"
            title={t('builder.layers.up')}
            aria-label={t('builder.layers.up')}
            onClick={() => props.onMove(layer.id, 1)}
            className="px-1 text-slate-400 hover:text-white"
          >
            ↑
          </button>
          <button
            type="button"
            title={t('builder.layers.down')}
            aria-label={t('builder.layers.down')}
            onClick={() => props.onMove(layer.id, -1)}
            className="px-1 text-slate-400 hover:text-white"
          >
            ↓
          </button>
          <button
            type="button"
            title={t('builder.layers.remove')}
            aria-label={t('builder.layers.remove')}
            onClick={() => props.onRemove(layer.id)}
            className="px-1 text-slate-400 hover:text-red-400"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  )
}
