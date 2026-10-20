import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Cherry, Moon, Wallet, X } from 'lucide-react'
import { cn } from '../../lib/format'
import type { AppInfo } from '../../data/mock'

// ---------- Button ----------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'icon'
}

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer whitespace-nowrap',
        size === 'sm' && 'h-7 px-2.5 text-xs',
        size === 'md' && 'h-8 px-3 text-[13px]',
        size === 'icon' && 'h-8 w-8',
        variant === 'primary' && 'bg-invert text-invert-fg hover:opacity-90',
        variant === 'secondary' && 'border border-line bg-card text-fg hover:bg-hover',
        variant === 'ghost' && 'text-muted hover:bg-hover hover:text-fg',
        variant === 'danger' && 'bg-red-500/90 text-white hover:bg-red-500',
        className,
      )}
    />
  )
}

// ---------- Card ----------

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('rounded-xl border border-line bg-card', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-fg">{title}</div>
        {sub && <div className="mt-0.5 text-xs text-subtle">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">{children}</div>
}

// ---------- Delta ----------

export function Delta({ value, unit = '%' }: { value: number; unit?: string }) {
  const up = value >= 0
  return (
    <span className={cn('tabular text-xs font-medium', up ? 'text-emerald-500' : 'text-red-500')}>
      {up ? '+' : ''}
      {value.toFixed(1)}
      {unit === 'pt' ? ' pt' : unit}
    </span>
  )
}

// ---------- Segmented / Chips ----------

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { key: T; label: string }[]
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-line bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'h-full cursor-pointer rounded px-2.5 text-xs font-medium transition-colors',
            value === o.key ? 'bg-hover text-fg shadow-sm' : 'text-subtle hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-7 cursor-pointer rounded-full border px-3 text-xs font-medium transition-colors',
        active ? 'border-transparent bg-invert text-invert-fg' : 'border-line text-muted hover:bg-hover hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

// ---------- Badge ----------

const badgeTones = {
  neutral: 'bg-hover text-muted',
  green: 'bg-emerald-500/12 text-emerald-500',
  red: 'bg-red-500/12 text-red-500',
  amber: 'bg-amber-500/12 text-amber-500',
  blue: 'bg-blue-500/12 text-blue-500',
  purple: 'bg-violet-500/12 text-violet-500',
}

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={cn('inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium', badgeTones[tone])}>{children}</span>
}

// ---------- Toggle ----------

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 cursor-pointer rounded-full transition-colors', checked ? 'bg-emerald-500' : 'bg-line-2')}
    >
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

// ---------- Popover / Menu ----------

export function Menu({
  trigger,
  children,
  align = 'right',
  side = 'bottom',
  width = 'w-56',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  side?: 'top' | 'bottom'
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<React.CSSProperties>({})
  const anchorRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  // Rendered in a portal with fixed coords so table/scroll containers can't clip it.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const place = () => {
      const r = anchorRef.current!.getBoundingClientRect()
      const popH = popRef.current?.offsetHeight ?? 0
      const flip = side === 'bottom' && r.bottom + popH + 8 > window.innerHeight && r.top > popH + 8
      const up = side === 'top' || flip
      setPos({
        ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
        ...(align === 'right' ? { right: window.innerWidth - r.right } : { left: r.left }),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, side, align])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!anchorRef.current?.contains(t) && !popRef.current?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  return (
    <div ref={anchorRef} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open &&
        createPortal(
          <div
            ref={popRef}
            style={pos}
            className={cn('animate-fade-in fixed z-[55] rounded-lg border border-line bg-panel p-1 text-fg shadow-xl shadow-black/20', width)}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function MenuItem({ icon, children, onClick, hint }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; hint?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-fg hover:bg-hover"
    >
      {icon && <span className="text-subtle">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </button>
  )
}

// ---------- Modal / Drawer ----------

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div className={cn('animate-fade-in flex max-h-[84vh] w-full flex-col rounded-xl border border-line bg-panel shadow-2xl', wide ? 'max-w-lg' : 'max-w-md')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="text-sm font-semibold">{title}</div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={15} />
          </Button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onMouseDown={onClose}>
      <aside
        className="animate-slide-in absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">{title}</div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={15} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </aside>
    </div>
  )
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
}

// ---------- Form bits ----------

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-muted">{label}</div>
      {children}
    </label>
  )
}

export const inputCls =
  'h-8 w-full rounded-md border border-line bg-card px-2.5 text-[13px] text-fg outline-none placeholder:text-subtle focus:border-line-2 focus:ring-2 focus:ring-blue-500/20'

// ---------- App icon ----------

const glyphs = { cherry: Cherry, wallet: Wallet, moon: Moon }

export function AppIcon({ app, size = 28 }: { app: Pick<AppInfo, 'name' | 'color' | 'glyph'>; size?: number }) {
  const G = app.glyph ? glyphs[app.glyph] : null
  return (
    <span className="grid shrink-0 place-items-center rounded-md font-semibold text-white" style={{ background: app.color, width: size, height: size, fontSize: size * 0.46 }}>
      {G ? <G size={size * 0.55} strokeWidth={2.2} /> : (app.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

// ---------- Empty state ----------

export function EmptyBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 max-w-sm text-xs text-subtle">{body}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
