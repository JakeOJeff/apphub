import { NavLink, useNavigate } from 'react-router-dom'
import { Check, ChevronsUpDown, Plus, Search, Settings2, Sparkles } from 'lucide-react'
import type { AppInfo } from '../../data/mock'
import { requiredPassed } from '../../shared/sources'
import { useAppState } from '../../state/AppState'
import { cn } from '../../lib/format'
import { AppIcon, Menu, MenuItem } from '../ui'
import { contentNav, mainNav, type NavItem } from './nav'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { apps, app, setAppId, setAppEditor, signOut, setPaletteOpen, setAiOpen, toast } = useAppState()
  const navigate = useNavigate()

  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-line bg-panel">
      {/* Workspace */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-invert">
          <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-semibold">Pyn Garden</div>
          <div className="truncate text-[11px] text-subtle">Smileox workspace</div>
        </div>
      </div>

      {/* App switcher */}
      <div className="px-3">
        <Menu
          align="left"
          width="w-[176px]"
          trigger={({ toggle }) => (
            <button onClick={toggle} className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-card px-2.5 py-2 text-left hover:bg-hover">
              <AppIcon app={app} size={26} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13px] font-semibold">{app.name}</div>
                <div className="flex items-center gap-1 truncate text-[11px] text-subtle"><StatusDot app={app} />Switch app</div>
              </div>
              <ChevronsUpDown size={14} className="text-subtle" />
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-subtle">Apps</div>
              {apps.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setAppId(a.id)
                    close()
                    toast(`Switched to ${a.name}`)
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover"
                >
                  <AppIcon app={a} size={20} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[13px]">{a.name}</div>
                    <div className="flex items-center gap-1 truncate text-[10px] text-subtle"><StatusDot app={a} />{a.demo ? 'Demo' : 'Supabase'}</div>
                  </div>
                  {a.id === app.id && <Check size={14} className="text-fg" />}
                </button>
              ))}
              <div className="my-1 h-px bg-line" />
              <MenuItem icon={<Plus size={14} />} onClick={() => { close(); onNavigate?.(); setAppEditor('new') }}>
                Add app
              </MenuItem>
              <MenuItem icon={<Settings2 size={14} />} onClick={() => { close(); onNavigate?.(); navigate('/apps') }}>
                Manage apps
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] text-muted hover:bg-hover hover:text-fg"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-line px-1 text-[10px] text-subtle">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pt-1 pb-3">
        <div className="space-y-0.5">
          {mainNav.map((item) => (
            <NavRow key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </div>
        <div className="mt-5 mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Content</div>
        <div className="space-y-0.5">
          {contentNav.map((item) => (
            <NavRow key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>

      {/* Ask AI */}
      <div className="px-3 pb-3">
        <button
          onClick={() => setAiOpen(true)}
          className="w-full cursor-pointer rounded-lg border border-violet-500/30 bg-violet-500/[0.06] p-3 text-left transition-colors hover:bg-violet-500/10"
        >
          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Sparkles size={14} className="text-violet-400" />
            Ask Pyn AI
          </div>
          <div className="mt-1 text-xs text-muted">Why did revenue drop yesterday?</div>
        </button>
      </div>

      {/* User */}
      <Menu
        align="left"
        side="top"
        width="w-[176px] ml-3"
        trigger={({ toggle }) => (
          <button onClick={toggle} className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line px-4 py-3 text-left hover:bg-hover">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-500 text-xs font-semibold text-white">F</span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-medium">Finu</div>
              <div className="truncate text-[11px] text-subtle">Owner · Production</div>
            </div>
          </button>
        )}
      >
        {(close) => (
          <>
            {['Profile', 'Team settings'].map((l) => (
              <MenuItem key={l} onClick={() => { close(); toast(l) }}>{l}</MenuItem>
            ))}
            <MenuItem onClick={() => { close(); signOut().catch(() => {}) }}>Sign out</MenuItem>
          </>
        )}
      </Menu>
    </aside>
  )
}

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors',
          isActive ? 'bg-hover font-medium text-fg' : 'text-muted hover:bg-hover hover:text-fg',
        )
      }
    >
      <Icon size={15} strokeWidth={1.75} />
      <span className="flex-1">{item.label}</span>
      {item.badge ? <span className="tabular grid h-[18px] min-w-[18px] place-items-center rounded bg-hover px-1 text-[10px] font-medium text-muted">{item.badge}</span> : null}
    </NavLink>
  )
}

function StatusDot({ app }: { app: AppInfo }) {
  const r = app.server?.lastCheck
  const tone = app.demo ? 'bg-zinc-500' : !r ? 'bg-blue-500' : requiredPassed(r) ? 'bg-emerald-500' : 'bg-red-500'
  return <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', tone)} />
}
