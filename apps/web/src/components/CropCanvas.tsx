import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { SHOWCASES, sliceRects, zoomFrame, type Frame, type ShowcaseKind } from '@profile-editor/core'

interface Props {
  image: CanvasImageSource
  imageWidth: number
  imageHeight: number
  kind: ShowcaseKind
  frame: Frame
  onChange: (frame: Frame) => void
}

interface View {
  scale: number
  ox: number
  oy: number
}

const PAD = 24
const ZOOM_STEP = 1.08

// Вписываем в холст и картинку, и рамку, чтобы рамка не терялась за краем
function fitView(width: number, height: number, box: { x: number; y: number; w: number; h: number }): View {
  const scale = Math.max(0.01, Math.min((width - PAD * 2) / box.w, (height - PAD * 2) / box.h))
  return {
    scale,
    ox: (width - box.w * scale) / 2 - box.x * scale,
    oy: (height - box.h * scale) / 2 - box.y * scale,
  }
}

export default function CropCanvas({ image, imageWidth, imageHeight, kind, frame, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  // пока тащим рамку, вид не пересчитываем, иначе картинка поедет под курсором
  const [frozenView, setFrozenView] = useState<View | null>(null)
  const drag = useRef<{ x: number; y: number; frame: Frame } | null>(null)
  const latest = useRef({ frame, kind, onChange })

  useLayoutEffect(() => {
    latest.current = { frame, kind, onChange }
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

  const frameW = SHOWCASES[kind].width * frame.scale
  const frameH = frame.height * frame.scale
  const left = Math.min(0, frame.x)
  const top = Math.min(0, frame.y)
  const view =
    frozenView ??
    fitView(size.width, size.height, {
      x: left,
      y: top,
      w: Math.max(imageWidth, frame.x + frameW) - left,
      h: Math.max(imageHeight, frame.y + frameH) - top,
    })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.width || !size.height) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, view.ox, view.oy, imageWidth * view.scale, imageHeight * view.scale)

    const boxes = sliceRects(kind, frame).map((rect) => ({
      rect,
      x: view.ox + rect.sx * view.scale,
      y: view.oy + rect.sy * view.scale,
      w: rect.sw * view.scale,
      h: rect.sh * view.scale,
    }))

    // затемняем всё, кроме частей витрины
    ctx.beginPath()
    ctx.rect(0, 0, size.width, size.height)
    for (const b of boxes) ctx.rect(b.x, b.y, b.w, b.h)
    ctx.fillStyle = 'rgba(6, 8, 13, 0.62)'
    ctx.fill('evenodd')

    ctx.strokeStyle = '#7c9cff'
    ctx.lineWidth = 1.5
    ctx.font = '600 11px "Inter Variable", system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    for (const b of boxes) {
      ctx.strokeRect(b.x, b.y, b.w, b.h)
      const label = `${b.rect.outWidth}×${b.rect.outHeight}`
      const labelWidth = ctx.measureText(label).width + 10
      if (labelWidth < b.w) {
        ctx.fillStyle = 'rgba(124, 156, 255, 0.92)'
        ctx.fillRect(b.x, b.y, labelWidth, 18)
        ctx.fillStyle = '#0b0e14'
        ctx.fillText(label, b.x + 5, b.y + 9)
      }
    }
  }, [image, imageWidth, imageHeight, kind, frame, size, view])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { frame, kind, onChange } = latest.current
      const next = e.deltaY < 0 ? frame.scale / ZOOM_STEP : frame.scale * ZOOM_STEP
      onChange(zoomFrame(kind, frame, next))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
    drag.current = { x: e.clientX, y: e.clientY, frame }
    setFrozenView(view)
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current
    if (!start) return
    onChange({
      ...start.frame,
      x: Math.round(start.frame.x + (e.clientX - start.x) / view.scale),
      y: Math.round(start.frame.y + (e.clientY - start.y) / view.scale),
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
    onChange({ ...frame, x: frame.x + move[0], y: frame.y + move[1] })
  }

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        tabIndex={0}
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
