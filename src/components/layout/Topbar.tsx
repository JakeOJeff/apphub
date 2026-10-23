import { useLocation, useNavigate } from 'react-router-dom'
import { AppWindow, Bell, Link2, Megaphone, Menu as MenuIcon, Moon, Plus, Search, Sun, TicketPercent, UserPlus } from 'lucide-react'
import { notifications } from '../../data/mock'
import { useAppState } from '../../state/AppState'
import { Button, Menu, MenuItem } from '../ui'
import { allNav } from './nav'

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { theme, toggleTheme, setPaletteOpen, setAppEditor, toast, isOwner, app } = useAppState()
  const shown = app.demo ? notifications : []
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const crumb = allNav.find((n) => pathname.startsWith(n.to))?.label ?? (pathname.startsWith('/team') ? 'Team' : 'Home')

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenNav} aria-label="Open navigation">
        <MenuIcon size={16} />
      </Button>
      <div className="text-[13px] text-muted">{crumb}</div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => setPaletteOpen(true)}
          className="hidden h-8 w-72 cursor-pointer items-center gap-2 rounded-md border border-line bg-card px-2.5 text-[13px] text-subtle hover:border-line-2 md:flex"
        >
          <Search size={14} />
          <span className="truncate">Search or ask "why did revenue drop?"</span>
        </button>

        <Menu
          trigger={({ toggle }) => (
            <Button variant="primary" onClick={toggle}>
              <Plus size={14} /> New
            </Button>
          )}
        >
          {(close) => (
            <>
              {isOwner && <MenuItem icon={<AppWindow size={14} />} onClick={() => { close(); setAppEditor('new') }}>App</MenuItem>}
              <MenuItem icon={<Link2 size={14} />} onClick={() => { close(); toast('New link') }}>Link</MenuItem>
              <MenuItem icon={<TicketPercent size={14} />} onClick={() => { close(); toast('New coupon') }}>Coupon</MenuItem>
              <MenuItem icon={<Megaphone size={14} />} onClick={() => { close(); toast('New campaign') }}>Campaign</MenuItem>
              {isOwner && <MenuItem icon={<UserPlus size={14} />} onClick={() => { close(); navigate('/team') }}>Invite teammate</MenuItem>}
            </>
          )}
        </Menu>

        <Button variant="secondary" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>

        <Menu
          width="w-80"
          trigger={({ toggle }) => (
            <Button variant="secondary" size="icon" onClick={toggle} aria-label="Notifications" className="relative">
              <Bell size={15} />
              {shown.length > 0 && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
            </Button>
          )}
        >
          {(close) => (
            <div>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[13px] font-semibold">Notifications</span>
                <button className="cursor-pointer text-xs text-subtle hover:text-fg" onClick={() => { close(); toast('All caught up') }}>
                  Mark all read
                </button>
              </div>
              {shown.length === 0 && <div className="px-2 py-6 text-center text-xs text-subtle">No notifications yet.</div>}
              {shown.map((n) => (
                <button key={n.id} onClick={close} className="block w-full cursor-pointer rounded-md px-2 py-2 text-left hover:bg-hover">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium">{n.title}</span>
                    <span className="text-[11px] text-subtle">{n.time}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{n.body}</div>
                </button>
              ))}
            </div>
          )}
        </Menu>
      </div>
    </header>
  )
}
