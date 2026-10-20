import { useLocation } from 'react-router-dom'
import { allNav } from '../components/layout/nav'
import { useAppState } from '../state/AppState'
import { Button, Card, EmptyBlock } from '../components/ui'

export function PlaceholderPage() {
  const { pathname } = useLocation()
  const { app, toast } = useAppState()
  const item = allNav.find((n) => pathname.startsWith(n.to))
  const Icon = item?.icon

  return (
    <div>
      <div className="flex items-center gap-2.5">
        {Icon && <Icon size={18} className="text-muted" />}
        <h1 className="text-xl font-semibold tracking-tight">{item?.label ?? 'Not found'}</h1>
      </div>
      <p className="mt-1 text-[13px] text-muted">{item?.blurb ?? 'This page does not exist.'} · {app.name}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <div className="h-3 w-20 rounded bg-hover" />
            <div className="mt-3 h-6 w-28 rounded bg-hover" />
            <div className="mt-4 h-6 rounded bg-card-2" />
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <EmptyBlock
          title={`${item?.label ?? 'This'} blocks go here`}
          body="Layout slot reserved. Ask to build this section next and it will follow the same components as Growth."
          action={<Button onClick={() => toast('Noted')}>Request this section</Button>}
        />
      </div>
    </div>
  )
}
