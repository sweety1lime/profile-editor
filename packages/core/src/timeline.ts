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

// Пока идёт сборка, все кадры всех частей витрины лежат в памяти распакованными:
// ширина × высота × 4 байта на каждый. Высокая витрина на полутора сотнях кадров выходит за
// гигабайт, и вкладка на телефоне умирает молча, без единого сообщения. Поэтому сетку времени
// прореживаем заранее, ещё до того как начали рисовать
export const FRAME_MEMORY_BUDGET = 256 * 1024 * 1024

export const framesInBudget = (bytesPerFrame: number, budget = FRAME_MEMORY_BUDGET) =>
  Math.max(1, Math.floor(budget / Math.max(1, bytesPerFrame)))

// Во сколько раз проредить сетку, чтобы уложиться в бюджет. 1 — прореживать не надо
export function stepForBudget(frames: number, bytesPerFrame: number, budget = FRAME_MEMORY_BUDGET): number {
  return Math.max(1, Math.ceil(frames / framesInBudget(bytesPerFrame, budget)))
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
