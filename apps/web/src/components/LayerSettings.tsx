import { useTranslation } from 'react-i18next'
import {
  ANIMATIONS,
  EFFECTS,
  EFFECT_COLORS,
  type ImageLayer,
  type Layer,
} from '@profile-editor/core'
import { RangeRow, Section, chipClass, inputClass, secondaryButton } from './controls'
import { FONTS } from '../lib/fonts'
import { newSeed } from '../lib/newLayer'
import type { CutoutModel } from '../lib/cutout'

// Настройки выбранного слоя. У каждого типа свои поля, общие — прозрачность и анимация

export interface CutoutProgress {
  layerId: string
  stage: 'download' | 'run'
  percent: number
}

interface Props {
  layer: Layer
  cutoutModel: CutoutModel
  cutout: CutoutProgress | null
  cutoutError: 'failed' | 'empty' | null
  onCutoutModel: (model: CutoutModel) => void
  onChange: (patch: Partial<Layer>) => void
  onCut: (layer: ImageLayer) => void
  onRestore: (layer: ImageLayer) => void
}

const colorInput = 'h-7 w-10 cursor-pointer rounded border border-line bg-transparent'

export default function LayerSettings(props: Props) {
  const { t } = useTranslation()
  const { layer, cutout, cutoutModel, onChange } = props

  return (
    <Section title={t('builder.layer.title')}>
      <div className="space-y-3 text-sm">
        {layer.type === 'image' && (
          <div className="space-y-2 rounded-lg border border-line bg-panel/60 p-3" data-cutout>
            <div className="text-slate-300">{t('builder.cutout.title')}</div>
            <div className="flex gap-1">
              {(['quality', 'fast'] as const).map((model) => (
                <button
                  key={model}
                  type="button"
                  onClick={() => props.onCutoutModel(model)}
                  className={chipClass(model === cutoutModel)}
                >
                  {t(`builder.cutout.models.${model}`)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={!!cutout} onClick={() => props.onCut(layer)} className={`${secondaryButton} flex-1`}>
                {cutout?.layerId === layer.id
                  ? cutout.stage === 'download'
                    ? t('builder.cutout.downloading', { percent: Math.round(cutout.percent) })
                    : t('builder.cutout.running')
                  : t('builder.cutout.run')}
              </button>
              {layer.originalAssetId && (
                <button type="button" disabled={!!cutout} onClick={() => props.onRestore(layer)} className={secondaryButton}>
                  {t('builder.cutout.restore')}
                </button>
              )}
            </div>
            {props.cutoutError && (
              <p className="text-xs text-red-400">
                {t(props.cutoutError === 'empty' ? 'builder.cutout.empty' : 'builder.cutout.error')}
              </p>
            )}
            <p className="text-xs text-slate-500">{t(`builder.cutout.note.${cutoutModel}`)}</p>
          </div>
        )}

        {layer.type === 'text' && (
          <>
            <textarea
              value={layer.text}
              onChange={(e) => onChange({ text: e.target.value })}
              rows={2}
              className={inputClass}
              aria-label={t('builder.layer.text')}
            />
            <label className="block">
              <span className="mb-1 block text-slate-400">{t('builder.layer.font')}</span>
              <select
                value={layer.font}
                onChange={(e) => onChange({ font: e.target.value })}
                className={inputClass}
                style={{ fontFamily: `"${layer.font}"` }}
              >
                {FONTS.map((font) => (
                  <option key={font} value={font} style={{ fontFamily: `"${font}"` }}>
                    {font}
                  </option>
                ))}
              </select>
            </label>
            <RangeRow
              label={t('builder.layer.size')}
              display={`${layer.size}`}
              value={layer.size}
              min={10}
              max={200}
              onChange={(size) => onChange({ size })}
            />
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={layer.weight >= 700}
                  onChange={(e) => onChange({ weight: e.target.checked ? 700 : 400 })}
                  className="accent-accent"
                />
                {t('builder.layer.bold')}
              </label>
              <label className="flex items-center gap-2 text-slate-400">
                {t('builder.layer.color')}
                <input type="color" value={layer.color} onChange={(e) => onChange({ color: e.target.value })} className={colorInput} />
              </label>
              <label className="flex items-center gap-2 text-slate-400">
                {t('builder.layer.strokeColor')}
                <input
                  type="color"
                  value={layer.strokeColor}
                  onChange={(e) => onChange({ strokeColor: e.target.value })}
                  className={colorInput}
                />
              </label>
            </div>
            <RangeRow
              label={t('builder.layer.stroke')}
              display={`${layer.stroke}`}
              value={layer.stroke}
              min={0}
              max={12}
              onChange={(stroke) => onChange({ stroke })}
            />
            <RangeRow
              label={t('builder.layer.glow')}
              display={`${layer.glow}`}
              value={layer.glow}
              min={0}
              max={40}
              onChange={(glow) => onChange({ glow })}
            />
          </>
        )}

        {layer.type === 'effect' && (
          <>
            <div className="flex flex-wrap gap-1" data-effects>
              {EFFECTS.map((effect) => (
                <button
                  key={effect}
                  type="button"
                  onClick={() => onChange({ effect, color: EFFECT_COLORS[effect] })}
                  className={chipClass(effect === layer.effect)}
                >
                  {t(`builder.effects.${effect}`)}
                </button>
              ))}
            </div>
            <RangeRow
              label={t('builder.effect.density')}
              display={`${Math.round(layer.density * 100)}%`}
              value={Math.round(layer.density * 100)}
              min={0}
              max={100}
              onChange={(value) => onChange({ density: value / 100 })}
            />
            {layer.effect !== 'stars' && (
              <>
                <RangeRow
                  label={t('builder.effect.speed')}
                  display={`${Math.round(layer.speed * 100)}%`}
                  value={Math.round(layer.speed * 100)}
                  min={0}
                  max={100}
                  onChange={(value) => onChange({ speed: value / 100 })}
                />
                <RangeRow
                  label={t('builder.effect.wind')}
                  display={`${Math.round(layer.wind * 100)}`}
                  value={Math.round(layer.wind * 100)}
                  min={-100}
                  max={100}
                  onChange={(value) => onChange({ wind: value / 100 })}
                />
              </>
            )}
            <RangeRow
              label={t('builder.effect.size')}
              display={`${Math.round(layer.size * 100)}%`}
              value={Math.round(layer.size * 100)}
              min={30}
              max={250}
              onChange={(value) => onChange({ size: value / 100 })}
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-slate-400">
                {t('builder.layer.color')}
                <input type="color" value={layer.color} onChange={(e) => onChange({ color: e.target.value })} className={colorInput} />
              </label>
              <button type="button" onClick={() => onChange({ seed: newSeed() })} className={secondaryButton}>
                {t('builder.effect.shuffle')}
              </button>
            </div>
          </>
        )}

        {layer.type !== 'effect' && (
          <>
            <RangeRow
              label={t('builder.layer.scale')}
              display={`${Math.round(layer.scale * 100)}%`}
              value={Math.round(layer.scale * 100)}
              min={2}
              max={400}
              onChange={(value) => onChange({ scale: value / 100 })}
            />
            <RangeRow
              label={t('builder.layer.rotation')}
              display={`${Math.round(layer.rotation)}°`}
              value={layer.rotation}
              min={-180}
              max={180}
              onChange={(rotation) => onChange({ rotation })}
            />
          </>
        )}

        <RangeRow
          label={t('builder.layer.opacity')}
          display={`${Math.round(layer.opacity * 100)}%`}
          value={Math.round(layer.opacity * 100)}
          min={0}
          max={100}
          onChange={(value) => onChange({ opacity: value / 100 })}
        />

        {layer.type === 'effect' ? (
          <p className="text-xs text-slate-500">{t('builder.effect.hint')}</p>
        ) : (
          <>
            <div>
              <span className="mb-1 block text-slate-400">{t('builder.layer.animation')}</span>
              <div className="flex flex-wrap gap-1">
                {ANIMATIONS.map((animation) => (
                  <button
                    key={animation}
                    type="button"
                    onClick={() => onChange({ animation })}
                    className={chipClass(animation === layer.animation)}
                  >
                    {t(`builder.animations.${animation}`)}
                  </button>
                ))}
              </div>
            </div>
            {layer.animation !== 'none' && (
              <RangeRow
                label={t('builder.layer.strength')}
                display={`${Math.round(layer.strength * 100)}%`}
                value={Math.round(layer.strength * 100)}
                min={0}
                max={100}
                onChange={(value) => onChange({ strength: value / 100 })}
              />
            )}
            <p className="text-xs text-slate-500">
              X {Math.round(layer.x)}, Y {Math.round(layer.y)} · {t('builder.layer.hint')}
            </p>
          </>
        )}
      </div>
    </Section>
  )
}
