import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AVATAR_VIEWS, clampAvatarCrop, resizeAvatarCrop, type AvatarCrop } from '@profile-editor/core'
import { RangeRow } from './controls'
import { drawAvatar } from '../lib/avatar'

interface Props {
  image: CanvasImageSource
  imageWidth: number
  imageHeight: number
  crop: AvatarCrop
  onChange: (crop: AvatarCrop) => void
}

const HEIGHT = 200
const PAD = 8
const ZOOM_STEP = 1.08

// Как аватар выглядит на своём месте: рисуем с плотностью экрана, иначе мелкие просмотры мылятся
function AvatarView({ image, crop, size, label }: { image: CanvasImageSource; crop: AvatarCrop; size: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    drawAvatar(canvas.getContext('2d')!, image, crop, canvas.width)
  }, [image, crop, size])

  return (
    <figure className="flex flex-col items-center gap-1">
      <canvas ref={ref} style={{ width: size, height: size }} className="border border-black" />
      <figcaption className="text-xs text-slate-500">{label}</figcaption>
    </figure>
  )
}

// Квадрат аватара поверх всего арта: тащим мышью, колесо меняет размер
export default function AvatarPicker({ image, imageWidth, imageHeight, crop, onChange }: Props) {
  const { t } = useTranslation()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const drag = useRef<{ x: number; y: number; crop: AvatarCrop } | null>(null)
  const latest = useRef({ crop, onChange })

  useLayoutEffect(() => {
    latest.current = { crop, onChange }
  })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = width ? Math.min((width - PAD * 2) / imageWidth, (HEIGHT - PAD * 2) / imageHeight) : 1
  const ox = (width - imageWidth * scale) / 2
  const oy = (HEIGHT - imageHeight * scale) / 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !width) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(HEIGHT * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, HEIGHT)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, ox, oy, imageWidth * scale, imageHeight * scale)

    const x = ox + crop.x * scale
    const y = oy + crop.y * scale
    const side = crop.size * scale
    ctx.beginPath()
    ctx.rect(0, 0, width, HEIGHT)
    ctx.rect(x, y, side, side)
    ctx.fillStyle = 'rgba(6, 8, 13, 0.62)'
    ctx.fill('evenodd')
    ctx.strokeStyle = '#7c9cff'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, side, side)
  }, [image, imageWidth, imageHeight, crop, width, scale, ox, oy])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { crop, onChange } = latest.current
      const next = e.deltaY < 0 ? crop.size / ZOOM_STEP : crop.size * ZOOM_STEP
      onChange(resizeAvatarCrop(crop, next, imageWidth, imageHeight))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [imageWidth, imageHeight])

  function toImage(e: PointerEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - box.left - ox) / scale, y: (e.clientY - box.top - oy) / scale }
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
    const point = toImage(e)
    const hit = point.x >= crop.x && point.x <= crop.x + crop.size && point.y >= crop.y && point.y <= crop.y + crop.size
    // мимо квадрата — переносим его под курсор и дальше тащим уже оттуда
    const start = hit
      ? crop
      : clampAvatarCrop({ ...crop, x: point.x - crop.size / 2, y: point.y - crop.size / 2 }, imageWidth, imageHeight)
    if (!hit) onChange(start)
    drag.current = { x: e.clientX, y: e.clientY, crop: start }
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current
    if (!start) return
    const next = {
      ...start.crop,
      x: start.crop.x + (e.clientX - start.x) / scale,
      y: start.crop.y + (e.clientY - start.y) / scale,
    }
    onChange(clampAvatarCrop(next, imageWidth, imageHeight))
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
    onChange(clampAvatarCrop({ ...crop, x: crop.x + move[0], y: crop.y + move[1] }, imageWidth, imageHeight))
  }

  const maxSize = Math.min(imageWidth, imageHeight)

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="overflow-hidden rounded-lg border border-line bg-ink" style={{ height: HEIGHT }}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          data-avatar-picker
          aria-label={t('kit.avatar.title')}
          style={{ width, height: HEIGHT }}
          className="cursor-move touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={onKeyDown}
        />
      </div>
      <RangeRow
        label={t('kit.avatar.size')}
        display={`${Math.round((crop.size / maxSize) * 100)}%`}
        value={crop.size}
        min={Math.min(16, maxSize)}
        max={maxSize}
        onChange={(size) => onChange(resizeAvatarCrop(crop, size, imageWidth, imageHeight))}
      />
      <div className="flex items-end gap-3">
        {AVATAR_VIEWS.map((view) => (
          <AvatarView key={view.id} image={image} crop={crop} size={view.size} label={t(`kit.avatar.views.${view.id}`)} />
        ))}
      </div>
    </div>
  )
}
