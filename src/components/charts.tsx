import { useState } from 'react'
import { compact, cn } from '../lib/format'

function path(values: number[], w: number, h: number, pad = 2, min?: number, max?: number) {
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const span = hi - lo || 1
  return values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w
    const y = pad + (1 - (v - lo) / span) * (h - pad * 2)
    return [x, y] as const
  })
}

const toLine = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')

// ---------- Sparkline ----------

export function Sparkline({ values, color, className }: { values: number[]; color: string; className?: string }) {
  const w = 100
  const h = 24
  const pts = values.length > 1 ? path(values, w, h, 3) : [[0, h / 2] as const, [w, h / 2] as const]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('h-6 w-full overflow-visible', className)}>
      <path d={toLine(pts)} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

// ---------- Two-series area chart ----------

export function AreaChart({
  series,
  labels,
  height = 200,
}: {
  series: { name: string; color: string; values: number[] }[]
  labels: string[]
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const w = 600
  const h = height
  const max = Math.max(...series.flatMap((s) => s.values)) * 1.08
  const n = series[0]?.values.length ?? 0

  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          setHover(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))))
        }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.name} id={`grad-${s.name}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={0} x2={w} y1={h * t} y2={h * t} stroke="var(--line)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s) => {
          const pts = path(s.values, w, h, 4, 0, max)
          return (
            <g key={s.name}>
              <path d={`${toLine(pts)} L${w},${h} L0,${h} Z`} fill={`url(#grad-${s.name})`} />
              <path d={toLine(pts)} fill="none" stroke={s.color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </g>
          )
        })}
      </svg>

      {hover !== null && (
        <>
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-line-2" style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%` }} />
          {series.map((s) => (
            <div
              key={s.name}
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
              style={{
                left: `${(hover / Math.max(1, n - 1)) * 100}%`,
                top: `${(4 + (1 - s.values[hover] / max) * (h - 8)) / h * 100}%`,
                background: s.color,
              }}
            />
          ))}
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-32 rounded-md border border-line bg-panel px-2.5 py-2 text-xs shadow-lg"
            style={hover > n / 2 ? { right: `${100 - (hover / Math.max(1, n - 1)) * 100 + 2}%` } : { left: `${(hover / Math.max(1, n - 1)) * 100 + 2}%` }}
          >
            <div className="mb-1 text-subtle">{labels[hover]}</div>
            {series.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="tabular font-medium text-fg">{compact(s.values[hover])}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------- Funnel (sqrt-scaled bars) ----------

export function FunnelBars({ steps, height = 170 }: { steps: { label: string; value: number; color: string }[]; height?: number }) {
  const max = Math.sqrt(steps[0]?.value || 1)
  return (
    <div className="flex items-end gap-2" style={{ height: height + 44 }}>
      {steps.map((s, i) => {
        const prev = steps[i - 1]
        const conv = prev ? (s.value / Math.max(1, prev.value)) * 100 : null
        const barH = Math.max(6, (Math.sqrt(s.value) / max) * height)
        return (
          <div key={s.label} className="group flex min-w-0 flex-1 flex-col justify-end" title={`${s.label}: ${s.value.toLocaleString()}`}>
            <div className="mb-1.5 min-w-0">
              <div className="tabular truncate text-lg font-semibold leading-tight">{compact(s.value)}</div>
              <div className="truncate text-[11px] text-subtle">
                {conv === null ? s.label : `${conv.toFixed(1)}% of ${prev!.label.toLowerCase()}`}
              </div>
            </div>
            <div className="rounded-t-md transition-[height,opacity] duration-300 group-hover:opacity-85" style={{ height: barH, background: s.color }} />
          </div>
        )
      })}
    </div>
  )
}

// ---------- Ranked bar list ----------

export function BarList({
  items,
  color,
  format,
}: {
  items: { label: string; value: number; sub?: string }[]
  color: string
  format: (n: number) => string
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-fg">
              {it.label}
              {it.sub && <span className="text-subtle"> · {it.sub}</span>}
            </span>
            <span className="tabular shrink-0 font-semibold">{format(it.value)}</span>
          </div>
          <div className="mt-1.5 h-[3px] rounded-full bg-hover">
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  )
}
