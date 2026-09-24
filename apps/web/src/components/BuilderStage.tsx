import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { layerAt, poseAt, sliceRects, slotFrame, zoomSceneFrame, type Frame, type Layer } from '@profile-editor/core'
import { drawScene, layerSize, type Scene, type SceneBackground } from '../lib/compose'

interface Props {
  scene: Scene
  background: SceneBackground | null
  assets: Map<string, ImageBitmap>
  selectedId: string | null
  playing: boolean
  // какой момент цикла показывать на паузе
  time: number
  // меняется, когда догрузились шрифты или картинки и сцену надо перерисовать
  redraw: number
  onSelect: (id: string | null) => void
  onLayerChange: (id: string, patch: Partial<Layer>) => void
  onBackgroundChange: (frame: Frame) => void
  onRemove: (id: string) => void
}

type Drag =
  | { kind: 'layer'; id: string; x: number; y: number; clientX: number; clientY: number }
  | { kind: 'background'; frame: Frame; clientX: number; clientY: number }

const PAD = 24
const ZOOM_STEP = 1.08

export default function BuilderStage(props: Props) {
  const { scene, background, assets, selectedId, playing, time, redraw } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneCanvas = useRef<HTMLCanvasElement | null>(null)
  const drag = useRef<Drag | null>(null)
  const latest = useRef(props)
  const [size, setSize] = useState({ width: 0, height: 0 })
  // момент, который сейчас на холсте: по нему ищем слой под курсором, он ведь движется
  const shownAt = useRef(0)

  useLayoutEffect(() => {
    latest.current = props
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

  const { width, height } = scene.box
  const viewScale = size.width
    ? Math.max(0.05, Math.min((size.width - PAD * 2) / width, (size.height - PAD * 2) / height))
    : 1
  const ox = (size.width - width * viewScale) / 2
  const oy = (size.height - height * viewScale) / 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.width || !size.height) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const offscreen = (sceneCanvas.current ??= document.createElement('canvas'))
    if (offscreen.width !== width || offscreen.height !== height) {
      offscreen.width = width
      offscreen.height = height
    }
    const sceneCtx = offscreen.getContext('2d')!
    // окна всех витрин холста: у одиночной витрины оно одно, у комплекта — по одному на витрину
    const rects = scene.box.slots.flatMap((slot) => sliceRects(slot.kind, slotFrame(slot)))

    const draw = (t: number) => {
      shownAt.current = t
      drawScene(sceneCtx, scene, t, background, assets)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size.width, size.height)
      ctx.fillStyle = '#10141c'
      ctx.fillRect(ox, oy, width * viewScale, height * viewScale)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(offscreen, ox, oy, width * viewScale, height * viewScale)

      // чего в профиле не видно — зазоры между частями и полосы между витринами — затемняем
      ctx.beginPath()
      ctx.rect(ox, oy, width * viewScale, height * viewScale)
      for (const r of rects) ctx.rect(ox + r.sx * viewScale, oy + r.sy * viewScale, r.sw * viewScale, r.sh * viewScale)
      ctx.fillStyle = 'rgba(6, 8, 13, 0.75)'
      ctx.fill('evenodd')
      ctx.strokeStyle = 'rgba(124, 156, 255, 0.5)'
      ctx.lineWidth = 1
      for (const r of rects) ctx.strokeRect(ox + r.sx * viewScale, oy + r.sy * viewScale, r.sw * viewScale, r.sh * viewScale)

      const layer = scene.layers.find((l) => l.id === selectedId)
      if (layer?.visible && layer.type !== 'effect') {
        const pose = poseAt(layer, t)
        const own = layerSize(layer)
        const w = own.width * pose.scale * viewScale
        const h = own.height * pose.scale * viewScale
        ctx.save()
        ctx.translate(ox + pose.x * viewScale, oy + pose.y * viewScale)
        ctx.rotate((pose.rotation * Math.PI) / 180)
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = '#7c9cff'
        ctx.lineWidth = 1.5
        ctx.strokeRect(-w / 2, -h / 2, w, h)
        ctx.restore()
      }
    }

    if (!playing) {
      draw(time)
      return
    }
    let frameId = 0
    const start = performance.now()
    const tick = () => {
      draw(((performance.now() - start) % scene.durationMs) / scene.durationMs)
      frameId = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frameId)
  }, [scene, background, assets, selectedId, playing, time, redraw, size, width, height, viewScale, ox, oy])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { scene, background, selectedId, onLayerChange, onBackgroundChange } = latest.current
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      const layer = scene.layers.find((l) => l.id === selectedId)
      if (layer && layer.type !== 'effect') onLayerChange(layer.id, { scale: Math.min(20, Math.max(0.02, layer.scale * factor)) })
      else if (background) onBackgroundChange(zoomSceneFrame(scene.box, background.frame, background.frame.scale / factor))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  function toScene(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - rect.left - ox) / viewScale, y: (e.clientY - rect.top - oy) / viewScale }
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
    const point = toScene(e)
    const hit = layerAt(scene.layers, layerSize, point.x, point.y, shownAt.current)
    if (hit) {
      props.onSelect(hit.id)
      drag.current = { kind: 'layer', id: hit.id, x: hit.x, y: hit.y, clientX: e.clientX, clientY: e.clientY }
    } else {
      props.onSelect(null)
      drag.current = background ? { kind: 'background', frame: background.frame, clientX: e.clientX, clientY: e.clientY } : null
    }
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.clientX) / viewScale
    const dy = (e.clientY - d.clientY) / viewScale
    if (d.kind === 'layer') props.onLayerChange(d.id, { x: Math.round(d.x + dx), y: Math.round(d.y + dy) })
    // фон тащим вместе с курсором, поэтому окно на фоне сдвигается в обратную сторону
    else props.onBackgroundChange({ ...d.frame, x: Math.round(d.frame.x - dx * d.frame.scale), y: Math.round(d.frame.y - dy * d.frame.scale) })
  }

  function onKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    const layer = scene.layers.find((l) => l.id === selectedId)
    if (!layer) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      props.onRemove(layer.id)
      return
    }
    if (layer.type === 'effect') return
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
    props.onLayerChange(layer.id, { x: layer.x + move[0], y: layer.y + move[1] })
  }

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        data-stage
        style={{ width: size.width, height: size.height }}
        className="cursor-move touch-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
