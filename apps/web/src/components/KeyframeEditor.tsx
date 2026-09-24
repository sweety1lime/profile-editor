import { useTranslation } from 'react-i18next'
import { keyframeAt, type Keyframe } from '@profile-editor/core'
import { RangeRow, secondaryButton } from './controls'

interface Props {
  keys: Keyframe[]
  // момент цикла, который сейчас на холсте, от 0 до 1
  time: number
  onTime: (time: number) => void
  onKeys: (keys: Keyframe[]) => void
}

// Ключ стоит на этом моменте, если до него меньше полпроцента цикла: ползунок ходит по процентам
const keyAt = (keys: Keyframe[], time: number) => keys.find((key) => Math.abs(key.t - time) < 0.005)

// Ключи анимации слоя: шкала цикла с ключами, момент на холсте и то, где слой в этом ключе
export default function KeyframeEditor({ keys, time, onTime, onKeys }: Props) {
  const { t } = useTranslation()
  const current = keyAt(keys, time)
  const percent = Math.round(time * 100)
  const update = (patch: Partial<Keyframe>) => onKeys(keys.map((key) => (key === current ? { ...key, ...patch } : key)))
  // новый ключ ставим туда, где слой и так проходит, чтобы движение от этого не дёрнулось
  const add = () => onKeys([...keys, { ...keyframeAt(keys, time), t: time }])

  return (
    <div className="space-y-3 rounded-lg border border-line bg-panel/60 p-3" data-keyframes>
      <div className="text-slate-300">{t('builder.keys.title')}</div>
      <div className="relative h-6 rounded bg-ink">
        {keys.map((key) => (
          <button
            key={key.t}
            type="button"
            onClick={() => onTime(key.t)}
            title={t('builder.keys.marker', { percent: Math.round(key.t * 100) })}
            aria-label={t('builder.keys.marker', { percent: Math.round(key.t * 100) })}
            className={`absolute top-1 h-4 w-2 -translate-x-1/2 rounded-sm ${key === current ? 'bg-accent' : 'bg-slate-400 hover:bg-white'}`}
            style={{ left: `${key.t * 100}%` }}
          />
        ))}
        <div className="pointer-events-none absolute top-0 h-6 w-px bg-accent/80" style={{ left: `${time * 100}%` }} />
      </div>
      <RangeRow
        label={t('builder.keys.time')}
        display={`${percent}%`}
        value={percent}
        min={0}
        max={99}
        onChange={(value) => onTime(value / 100)}
      />
      {current ? (
        <>
          <RangeRow
            label={t('builder.keys.x')}
            display={`${Math.round(current.x)}`}
            value={current.x}
            min={-400}
            max={400}
            onChange={(x) => update({ x })}
          />
          <RangeRow
            label={t('builder.keys.y')}
            display={`${Math.round(current.y)}`}
            value={current.y}
            min={-400}
            max={400}
            onChange={(y) => update({ y })}
          />
          <RangeRow
            label={t('builder.keys.scale')}
            display={`${Math.round(current.scale * 100)}%`}
            value={Math.round(current.scale * 100)}
            min={10}
            max={300}
            onChange={(value) => update({ scale: value / 100 })}
          />
          <RangeRow
            label={t('builder.keys.rotation')}
            display={`${Math.round(current.rotation)}°`}
            value={current.rotation}
            min={-180}
            max={180}
            onChange={(rotation) => update({ rotation })}
          />
          <RangeRow
            label={t('builder.keys.opacity')}
            display={`${Math.round(current.opacity * 100)}%`}
            value={Math.round(current.opacity * 100)}
            min={0}
            max={100}
            onChange={(value) => update({ opacity: value / 100 })}
          />
          <button type="button" onClick={() => onKeys(keys.filter((key) => key !== current))} className={secondaryButton}>
            {t('builder.keys.remove')}
          </button>
        </>
      ) : (
        <button type="button" onClick={add} className={`${secondaryButton} w-full`}>
          {t('builder.keys.add', { percent })}
        </button>
      )}
      <p className="text-xs text-slate-500">{t('builder.keys.hint')}</p>
    </div>
  )
}
