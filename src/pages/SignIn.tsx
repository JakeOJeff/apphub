import { useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { useAppState } from '../state/AppState'
import { Button, inputCls } from '../components/ui'

export function SignIn() {
  const { signIn } = useAppState()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(password)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="animate-fade-in w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-xl">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-invert">
            <span className="h-3 w-3 rounded-sm bg-violet-500" />
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">Pyn Garden</div>
            <div className="text-[11px] text-subtle">Sign in to continue</div>
          </div>
        </div>
        <label className="mt-6 block">
          <div className="mb-1 text-xs font-medium text-muted">Password</div>
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        </label>
        {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        <Button variant="primary" type="submit" className="mt-4 w-full" disabled={!password || busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Sign in
        </Button>
      </form>
    </div>
  )
}
