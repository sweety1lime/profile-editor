import { useEffect, useRef, useState, type ReactNode } from 'react'

// Уменьшает широкий блок под доступную ширину, сохраняя его настоящую раскладку внутри
export default function ScaledBox({ width, fit, children }: { width: number; fit: boolean; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    const observer = new ResizeObserver(() => {
      setAvailable(o.clientWidth)
      setHeight(i.offsetHeight)
    })
    observer.observe(o)
    observer.observe(i)
    return () => observer.disconnect()
  }, [])

  const scale = fit && available ? Math.min(1, available / width) : 1

  return (
    <div ref={outer} className="h-full overflow-auto">
      <div style={{ width: width * scale, height: height * scale }}>
        <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
