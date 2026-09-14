import type { ReactNode } from 'react'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  )
}

export function RangeRow(props: {
  label: string
  display: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-slate-400">
        <span>{props.label}</span>
        <span className="text-white">{props.display}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </label>
  )
}

export const inputClass =
  'w-full min-w-0 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent'
export const secondaryButton =
  'rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50'
export const toggleClass = (active: boolean) =>
  `rounded-lg border px-3 py-2 text-left transition-colors ${
    active ? 'border-accent bg-accent/10 text-white' : 'border-line bg-panel text-slate-300 hover:border-slate-500'
  }`
export const chipClass = (active: boolean) =>
  `rounded-md border px-2 py-1 text-xs ${active ? 'border-accent bg-accent/10 text-white' : 'border-line text-slate-400 hover:text-white'}`
