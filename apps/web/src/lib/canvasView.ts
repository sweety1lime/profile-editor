// Вид холста с рамкой нарезки: во сколько раз уменьшено и куда сдвинуто

export interface View {
  scale: number
  ox: number
  oy: number
}

// отступ от краёв холста и шаг зума колёсиком
export const PAD = 24
export const ZOOM_STEP = 1.08

// вписывает прямоугольник в холст целиком, с отступом по краям
export function fitView(width: number, height: number, box: { x: number; y: number; w: number; h: number }): View {
  const scale = Math.max(0.01, Math.min((width - PAD * 2) / box.w, (height - PAD * 2) / box.h))
  return {
    scale,
    ox: (width - box.w * scale) / 2 - box.x * scale,
    oy: (height - box.h * scale) / 2 - box.y * scale,
  }
}
