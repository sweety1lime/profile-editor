export const FPS_OPTIONS = [10, 12, 15, 20, 25] as const
export const MAX_FRAMES = 150
export const MAX_CLIP_SECONDS = 10
// задержки короче 2 сотых браузеры растягивают до 10, так что меньше не ставим
export const MIN_DELAY_CS = 2

export interface Timeline {
  timestamps: number[]
  delays: number[]
}

export const delayForFps = (fps: number) => Math.max(MIN_DELAY_CS, Math.round(100 / fps))

export function nearestFps(fps: number): number {
  return FPS_OPTIONS.reduce((best, option) => (Math.abs(option - fps) < Math.abs(best - fps) ? option : best))
}

// Кадры берём через равные промежутки. У всех частей витрины одна сетка времени,
// поэтому анимация в частях не разъезжается
export function buildTimeline(start: number, length: number, fps: number): Timeline {
  const delay = delayForFps(fps)
  const count = Math.min(MAX_FRAMES, Math.max(1, Math.round((length * 100) / delay)))
  return {
    timestamps: Array.from({ length: count }, (_, i) => Math.round((start + (i * delay) / 100) * 1000) / 1000),
    delays: Array.from({ length: count }, () => delay),
  }
}

// Оставляет каждый step-й кадр, а его задержку растягивает на выброшенные,
// чтобы длина анимации не менялась
export function thinFrames(delays: number[], step: number): { indices: number[]; delays: number[] } {
  const indices: number[] = []
  const out: number[] = []
  for (let i = 0; i < delays.length; i += step) {
    indices.push(i)
    out.push(delays.slice(i, i + step).reduce((sum, d) => sum + d, 0))
  }
  return { indices, delays: out }
}
