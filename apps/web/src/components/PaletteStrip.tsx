import type { PaletteColor } from '@profile-editor/core'
import { colorToHex } from '../lib/palette'

// Полоска из цветов палитры, ширина каждого цвета по его доле
export default function PaletteStrip({ palette, className = '' }: { palette: PaletteColor[]; className?: string }) {
  return (
    <div className={`flex overflow-hidden rounded ${className}`}>
      {palette.map((c, i) => (
        <div key={i} style={{ flexGrow: c.weight, background: colorToHex(c) }} />
      ))}
    </div>
  )
}
