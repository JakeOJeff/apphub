import { Database, KeyRound, Plus } from 'lucide-react'
import { useAppState } from '../state/AppState'
import { Button, Card } from '../components/ui'

/** Shown instead of pages until the first app is added. */
export function Welcome() {
  const { setAppEditor, appsError } = useAppState()
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Add your first app</h1>
      <p className="mt-2 text-[13px] text-muted">Connect an app’s Supabase project to start. You’ll need the project URL, the publishable key and the secret key.</p>
      {appsError && <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2 text-xs text-red-500">{appsError}</div>}
      <Button variant="primary" className="mt-6" onClick={() => setAppEditor('new')} disabled={!!appsError}>
        <Plus size={14} /> Add app
      </Button>
      <div className="mt-10 grid gap-3 text-left sm:grid-cols-2">
        <Card className="p-4">
          <KeyRound size={16} className="text-subtle" />
          <div className="mt-2 text-[13px] font-semibold">Keys stay on the server</div>
          <div className="mt-1 text-xs text-muted">Secrets are encrypted at rest and never sent back to the browser.</div>
        </Card>
        <Card className="p-4">
          <Database size={16} className="text-subtle" />
          <div className="mt-2 text-[13px] font-semibold">Same access as your admin</div>
          <div className="mt-1 text-xs text-muted">Reads use the secret key server-side, like goumi-web’s admin pages.</div>
        </Card>
      </div>
    </div>
  )
}
