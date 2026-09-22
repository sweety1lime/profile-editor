import { EFFECT_COLORS, type EffectLayer, type ImageLayer, type TextLayer } from '@profile-editor/core'

// Новые слои конструктора: всё появляется по центру витрины и без анимации

export const newSeed = () => Math.floor(Math.random() * 2 ** 31)

interface Stage {
  width: number
  height: number
}

const base = (id: string, name: string, stage: Stage) => ({
  id,
  name,
  x: Math.round(stage.width / 2),
  y: Math.round(stage.height / 2),
  scale: 1,
  rotation: 0,
  opacity: 1,
  visible: true,
  animation: 'none' as const,
  strength: 0.6,
})

export function imageLayer(id: string, name: string, bitmap: ImageBitmap, stage: Stage): ImageLayer {
  return {
    ...base(id, name, stage),
    type: 'image',
    assetId: id,
    width: bitmap.width,
    height: bitmap.height,
    // большую картинку сразу вписываем в витрину
    scale: Math.min(1, (stage.width * 0.8) / bitmap.width, (stage.height * 0.8) / bitmap.height),
  }
}

export function textLayer(id: string, text: string, stage: Stage): TextLayer {
  return {
    ...base(id, text, stage),
    type: 'text',
    text,
    font: 'Russo One',
    size: 56,
    weight: 400,
    color: '#ffffff',
    stroke: 3,
    strokeColor: '#000000',
    glow: 0,
  }
}

// У эффекта частицы на всей витрине, поэтому место и размер слоя не используются
export function effectLayer(id: string, stage: Stage): EffectLayer {
  return {
    ...base(id, 'snow', stage),
    type: 'effect',
    effect: 'snow',
    density: 0.5,
    speed: 0.5,
    size: 1,
    wind: 0.2,
    color: EFFECT_COLORS.snow,
    seed: newSeed(),
    x: 0,
    y: 0,
    strength: 0,
  }
}
