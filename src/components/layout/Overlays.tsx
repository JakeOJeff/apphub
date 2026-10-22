import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, CornerDownLeft, Search, Sparkles, X } from 'lucide-react'
import { useAppState } from '../../state/AppState'
import { cn } from '../../lib/format'
import { Button } from '../ui'
import { allNav } from './nav'

// ---------- ⌘K command palette ----------

const growthTabs = [
  ['Deep links', '/growth/links'],
  ['Coupons', '/growth/coupons'],
  ['Referrals', '/growth/referrals'],
  ['Campaigns', '/growth/campaigns'],
  ['Attribution', '/growth/attribution'],
  ['Data & setup', '/growth/setup'],
] as const

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setAiOpen, toggleTheme, setAppEditor, isOwner } = useAppState()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  const items = useMemo(() => {
    const base = [
      ...allNav.map((n) => ({ label: n.label, group: 'Go to', run: () => navigate(n.to) })),
      ...growthTabs.map(([l, to]) => ({ label: `Growth → ${l}`, group: 'Go to', run: () => navigate(to) })),
      ...(isOwner
        ? [
            { label: 'Add app', group: 'Actions', run: () => setAppEditor('new') },
            { label: 'Team & access', group: 'Go to', run: () => navigate('/team') },
          ]
        : []),
      { label: 'Toggle light / dark theme', group: 'Actions', run: toggleTheme },
    ]
    const filtered = base.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()))
    if (q.trim()) filtered.push({ label: `Ask Pyn AI: "${q}"`, group: 'AI', run: () => setAiOpen(true) })
    return filtered
  }, [q, navigate, toggleTheme, setAiOpen, setAppEditor, isOwner])

  useEffect(() => {
    if (paletteOpen) {
      setQ('')
      setActive(0)
    }
  }, [paletteOpen])

  if (!paletteOpen) return null

  const run = (i: number) => {
    items[i]?.run()
    setPaletteOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[14vh]" onMouseDown={() => setPaletteOpen(false)}>
      <div className="animate-fade-in w-full max-w-lg overflow-hidden rounded-xl border border-line bg-panel shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={15} className="text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
              if (e.key === 'Enter') run(active)
              if (e.key === 'Escape') setPaletteOpen(false)
            }}
            placeholder='Search pages or ask "why did revenue drop?"'
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-subtle">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {items.length === 0 && <div className="px-3 py-6 text-center text-xs text-subtle">No results</div>}
          {items.map((it, i) => (
            <button
              key={it.label}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(i)}
              className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px]', i === active && 'bg-hover')}
            >
              {it.group === 'AI' && <Sparkles size={14} className="text-violet-400" />}
              <span className="flex-1 truncate">{it.label}</span>
              <span className="text-[11px] text-subtle">{it.group}</span>
              {i === active && <CornerDownLeft size={12} className="text-subtle" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- Ask Pyn AI panel ----------

type Msg = { role: 'user' | 'ai'; text: string }

const suggestions = ['Why did revenue drop yesterday?', 'Which campaign should I pause?', 'Summarize this week for Goumi']

export function AiPanel() {
  const { aiOpen, setAiOpen, app } = useAppState()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')

  if (!aiOpen) return null

  const send = (text: string) => {
    if (!text.trim()) return
    setMsgs((m) => [
      ...m,
      { role: 'user', text },
      { role: 'ai', text: `Placeholder answer for ${app.name}. Hook this up to your AI endpoint later — the panel, history and input already work.` },
    ])
    setDraft('')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onMouseDown={() => setAiOpen(false)}>
      <aside className="animate-slide-in absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-line bg-panel shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={15} className="text-violet-400" /> Ask Pyn AI
          </div>
          <Button variant="ghost" size="icon" onClick={() => setAiOpen(false)} aria-label="Close">
            <X size={15} />
          </Button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {msgs.length === 0 && (
            <div className="space-y-2">
              <div className="text-xs text-subtle">Try asking</div>
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="block w-full cursor-pointer rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:bg-hover">
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cn('max-w-[85%] rounded-lg px-3 py-2 text-[13px]', m.role === 'user' ? 'ml-auto bg-invert text-invert-fg' : 'bg-card-2 text-fg')}>
              {m.text}
            </div>
          ))}
        </div>
        <form
          className="flex items-center gap-2 border-t border-line p-3"
          onSubmit={(e) => { e.preventDefault(); send(draft) }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Ask about ${app.name}…`}
            className="h-9 flex-1 rounded-md border border-line bg-card px-3 text-[13px] outline-none placeholder:text-subtle focus:border-line-2"
            autoFocus
          />
          <Button type="submit" variant="primary" size="icon" aria-label="Send">
            <ArrowUp size={15} />
          </Button>
        </form>
      </aside>
    </div>
  )
}

// ---------- Toasts ----------

export function Toasts() {
  const { toasts } = useAppState()
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="animate-fade-in rounded-lg border border-line bg-panel px-3.5 py-2 text-[13px] shadow-xl">
          {t.message}
        </div>
      ))}
    </div>
  )
}
