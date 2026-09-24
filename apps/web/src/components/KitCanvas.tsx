import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  PROFILE_BACKGROUND_WIDTH,
  PROFILE_COLUMN_X,
  PROFILE_LAYOUT,
  SHOWCASES,
  isCut,
  kitBackgroundHeight,
  kitSliceRects,
  zoomKit,
  type KitBlock,
  type KitPlacement,
  type KitSlot,
  type ShowcaseKind,
} from '@profile-editor/core'

interface Props {
  image: CanvasImageSource
  imageWidth: number
  imageHeight: number
  slots: KitSlot[]
  // все витрины страницы, и другие тоже: их показываем серыми блоками
  blocks: KitBlock[]
  placement: KitPlacement
  labels: Record<ShowcaseKind, string>
  otherLabel: string
  // фон профиля из магазина очков: видно, как арт ляжет на него
  backdrop: HTMLImageElement | null
  onChange: (placement: KitPlacement) => void
}

interface View {
  scale: number
  ox: number
  oy: number
}

const PAD = 24
const ZOOM_STEP = 1.08
const PAGE_COLOR = '#0b0e14'
const BLOCK_COLOR = 'rgba(255, 255, 255, 0.07)'
const OUTLINE_COLOR = '#7c9cff'

// Вписываем в холст и страницу профиля, и сам арт: за краем не должно теряться ни то, ни другое
function fitView(width: number, height: number, box: { x: number; y: number; w: number; h: number }): View {
  const scale = Math.max(0.01, Math.min((width - PAD * 2) / box.w, (height - PAD * 2) / box.h))
  return {
    scale,
    ox: (width - box.w * scale) / 2 - box.x * scale,
    oy: (height - box.h * scale) / 2 - box.y * scale,
  }
}

// Размер части витрины в готовом файле: у мастерской он крупнее, чем на странице
function partSize(kind: ShowcaseKind, height: number): string {
  const slice = SHOWCASES[kind].slices[0]!
  const width = SHOWCASES[kind].exportWidth ?? Math.round(slice.width)
  return `${width}×${Math.max(1, Math.round(height * (width / slice.width)))}`
}

export default function KitCanvas(props: Props) {
  const { image, imageWidth, imageHeight, slots, blocks, placement, labels, otherLabel, backdrop, onChange } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  // пока тащим арт, вид не пересчитываем, иначе он поедет под курсором
  const [frozenView, setFrozenView] = useState<View | null>(null)
  const drag = useRef<{ x: number; y: number; placement: KitPlacement } | null>(null)
  const latest = useRef({ placement, onChange })

  useLayoutEffect(() => {
    latest.current = { placement, onChange }
  })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const pageHeight = kitBackgroundHeight(blocks)
  const artWidth = imageWidth * placement.scale
  const artHeight = imageHeight * placement.scale
  const left = Math.min(0, placement.x)
  const top = Math.min(0, placement.y)
  const view =
    frozenView ??
    fitView(size.width, size.height, {
      x: left,
      y: top,
      w: Math.max(PROFILE_BACKGROUND_WIDTH, placement.x + artWidth) - left,
      h: Math.max(pageHeight, placement.y + artHeight) - top,
    })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.width || !size.height) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const at = (x: number, y: number) => ({ x: view.ox + x * view.scale, y: view.oy + y * view.scale })

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.imageSmoothingQuality = 'high'

    // страница профиля под артом: по ней видно, сколько фона останется пустым
    const page = at(0, 0)
    ctx.fillStyle = PAGE_COLOR
    ctx.fillRect(page.x, page.y, PROFILE_BACKGROUND_WIDTH * view.scale, pageHeight * view.scale)
    if (backdrop?.naturalWidth) {
      const height = (backdrop.naturalHeight / backdrop.naturalWidth) * PROFILE_BACKGROUND_WIDTH
      ctx.drawImage(backdrop, page.x, page.y, PROFILE_BACKGROUND_WIDTH * view.scale, height * view.scale)
    }

    const art = at(placement.x, placement.y)
    ctx.drawImage(image, art.x, art.y, artWidth * view.scale, artHeight * view.scale)

    const parts = slots.flatMap((slot) =>
      kitSliceRects(slot).map((rect) => {
        const point = at(rect.x, rect.y)
        return { x: point.x, y: point.y, w: rect.width * view.scale, h: rect.height * view.scale }
      }),
    )

    // затемняем всё, кроме частей витрин: светлым осталось ровно то, что попадёт в Steam
    ctx.beginPath()
    ctx.rect(0, 0, size.width, size.height)
    for (const part of parts) ctx.rect(part.x, part.y, part.w, part.h)
    ctx.fillStyle = 'rgba(6, 8, 13, 0.66)'
    ctx.fill('evenodd')

    // блоки витрин целиком: шапка и отступы, которые Steam рисует поверх фона. Другие витрины
    // закрывают арт целиком, их заливаем, чтобы было видно, куда картинка не попадёт
    ctx.lineWidth = 1
    ctx.font = '600 11px "Inter Variable", system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    for (const block of blocks) {
      const corner = at(PROFILE_COLUMN_X, block.top)
      const w = PROFILE_LAYOUT.leftWidth * view.scale
      const h = block.height * view.scale
      if (!isCut(block.kind)) {
        ctx.fillStyle = 'rgba(40, 44, 54, 0.9)'
        ctx.fillRect(corner.x, corner.y, w, h)
        if (h > 16) {
          ctx.fillStyle = '#8f98a0'
          ctx.fillText(otherLabel, corner.x + 8, corner.y + Math.min(h / 2, 14))
        }
      }
      ctx.strokeStyle = BLOCK_COLOR
      ctx.strokeRect(corner.x, corner.y, w, h)
    }

    ctx.strokeStyle = OUTLINE_COLOR
    ctx.lineWidth = 1.5
    for (const part of parts) ctx.strokeRect(part.x, part.y, part.w, part.h)

    for (const slot of slots) {
      const point = at(slot.x, slot.y)
      const label = `${labels[slot.kind]} · ${partSize(slot.kind, slot.height)}`
      const width = ctx.measureText(label).width + 10
      if (width < slot.width * view.scale && slot.height * view.scale > 24) {
        ctx.fillStyle = 'rgba(124, 156, 255, 0.92)'
        ctx.fillRect(point.x, point.y, width, 18)
        ctx.fillStyle = PAGE_COLOR
        ctx.fillText(label, point.x + 5, point.y + 9)
      }
    }
  }, [image, imageWidth, imageHeight, slots, blocks, placement, labels, otherLabel, backdrop, size, view, pageHeight, artWidth, artHeight])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const current = latest.current
      const box = canvas.getBoundingClientRect()
      // точка профиля под курсором остаётся на месте
      const center = {
        x: (e.clientX - box.left - view.ox) / view.scale,
        y: (e.clientY - box.top - view.oy) / view.scale,
      }
      const next = e.deltaY < 0 ? current.placement.scale * ZOOM_STEP : current.placement.scale / ZOOM_STEP
      current.onChange(zoomKit(current.placement, next, center))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [view])

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
    drag.current = { x: e.clientX, y: e.clientY, placement }
    setFrozenView(view)
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current
    if (!start) return
    onChange({
      ...start.placement,
      x: start.placement.x + (e.clientX - start.x) / view.scale,
      y: start.placement.y + (e.clientY - start.y) / view.scale,
    })
  }

  function onPointerUp() {
    drag.current = null
    setFrozenView(null)
  }

  function onKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    const step = e.shiftKey ? 10 : 1
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    onChange({ ...placement, x: placement.x + move[0], y: placement.y + move[1] })
  }

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        data-kit-canvas
        style={{ width: size.width, height: size.height }}
        className="cursor-grab touch-none rounded-xl outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-accent/50"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
