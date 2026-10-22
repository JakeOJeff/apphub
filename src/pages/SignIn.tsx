import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, LogOut, Mail, ShieldOff } from 'lucide-react'
import { authClient, authMessage } from '../lib/auth'
import { useAppState } from '../state/AppState'
import { Button, inputCls } from '../components/ui'
import { cn } from '../lib/format'

type Mode = 'password' | 'link' | 'signup' | 'reset'

const tabs: { id: Mode; label: string }[] = [
  { id: 'password', label: 'Password' },
  { id: 'link', label: 'Email link' },
  { id: 'signup', label: 'Create account' },
]

export function SignIn() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const sb = (await authClient())!
      const redirectTo = window.location.origin
      if (mode === 'password') {
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (error) throw error
        return // AppState picks up SIGNED_IN
      }
      if (mode === 'link') {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } })
        if (error) throw /signups not allowed|not found/i.test(error.message) ? new Error('not_invited') : error
        setSent(`We sent a sign-in link to ${email}.`)
      }
      if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
        if (error) throw error
        if (data.session) return
        setSent(`Check ${email} for a link to confirm your account.`)
      }
      if (mode === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo })
        if (error) throw error
        setSent(`If ${email} has an account, a reset link is on its way.`)
      }
    } catch (err) {
      setError(authMessage(err))
    }
    setBusy(false)
  }

  const needsPassword = mode === 'password' || mode === 'signup'

  return (
    <AuthCard subtitle={mode === 'reset' ? 'Reset your password' : 'Sign in to continue'}>
      {sent ? (
        <div className="mt-6">
          <div className="flex items-start gap-2 rounded-md border border-line bg-card px-3 py-2.5 text-[13px]">
            <Mail size={14} className="mt-0.5 shrink-0 text-violet-400" />
            {sent}
          </div>
          <Button className="mt-4 w-full" onClick={() => { setSent(null); setMode('password') }}>Back to sign in</Button>
        </div>
      ) : (
        <form onSubmit={submit}>
          {mode !== 'reset' && (
            <div className="mt-5 flex gap-1 rounded-lg bg-hover p-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setMode(t.id); setError(null) }}
                  className={cn('flex-1 cursor-pointer rounded-md py-1 text-xs font-medium', mode === t.id ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg')}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <label className="mt-4 block">
            <div className="mb-1 text-xs font-medium text-muted">Email</div>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" />
          </label>
          {needsPassword && (
            <label className="mt-3 block">
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                Password
                {mode === 'password' && (
                  <button type="button" className="cursor-pointer text-subtle hover:text-fg" onClick={() => { setMode('reset'); setError(null) }}>
                    Forgot?
                  </button>
                )}
              </div>
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? 8 : undefined}
              />
            </label>
          )}
          {mode === 'signup' && <div className="mt-2 text-[11px] text-subtle">Invite only. Use the email an owner added on the Team page.</div>}
          {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
          <Button variant="primary" type="submit" className="mt-4 w-full" disabled={!email || (needsPassword && !password) || busy}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {{ password: 'Sign in', link: 'Email me a link', signup: 'Create account', reset: 'Send reset link' }[mode]}
          </Button>
          {mode === 'reset' && (
            <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => setMode('password')}>Back</Button>
          )}
        </form>
      )}
    </AuthCard>
  )
}

/** Signed in, but this account isn't on the team (or arrived from a reset link and needs a new password). */
export function NoAccess() {
  const { signOut } = useAppState()
  return (
    <AuthCard subtitle="No access yet">
      <div className="mt-6 flex items-start gap-2 text-[13px] text-muted">
        <ShieldOff size={14} className="mt-0.5 shrink-0" />
        This account isn’t on the apphub team. Ask an owner to invite you, then sign in again.
      </div>
      <Button className="mt-4 w-full" onClick={() => signOut()}><LogOut size={14} /> Sign out</Button>
    </AuthCard>
  )
}

/** Shown after a password-reset link: pick a new password. */
export function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await (await authClient())!.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(authMessage(error))
    else onDone()
  }
  return (
    <AuthCard subtitle="Choose a new password">
      <form onSubmit={submit}>
        <label className="mt-6 block">
          <div className="mb-1 text-xs font-medium text-muted">New password</div>
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" minLength={8} />
        </label>
        {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        <Button variant="primary" type="submit" className="mt-4 w-full" disabled={password.length < 8 || busy}>
          {busy && <Loader2 size={14} className="animate-spin" />} Save password
        </Button>
      </form>
    </AuthCard>
  )
}

/** True after arriving from a password-reset email, until a new password is saved. */
export function usePasswordRecovery() {
  // The URL check covers the event firing before this subscribes.
  const [recovering, setRecovering] = useState(() => window.location.hash.includes('type=recovery'))
  useEffect(() => {
    let unsubscribe = () => {}
    authClient()
      .then((sb) => {
        if (!sb) return
        const { data } = sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') setRecovering(true) })
        unsubscribe = () => data.subscription.unsubscribe()
      })
      .catch(() => {})
    return () => unsubscribe()
  }, [])
  return [recovering, () => setRecovering(false)] as const
}

function AuthCard({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="animate-fade-in w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-xl">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-invert">
            <span className="h-3 w-3 rounded-sm bg-violet-500" />
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">Pyn Garden</div>
            <div className="text-[11px] text-subtle">{subtitle}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
