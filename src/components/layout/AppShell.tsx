import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { AiPanel, CommandPalette, Toasts } from './Overlays'
import { AppEditor } from '../AppEditor'

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex min-h-full">
      <div className="sticky top-0 hidden h-screen lg:block">
        <Sidebar />
      </div>

      {navOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onMouseDown={() => setNavOpen(false)}>
          <div className="animate-fade-in h-full w-fit" onMouseDown={(e) => e.stopPropagation()}>
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </div>

      <AppEditor />
      <CommandPalette />
      <AiPanel />
      <Toasts />
    </div>
  )
}
