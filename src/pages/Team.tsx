import { useCallback, useEffect, useMemo, useState } from 'react'
import { Crown, Loader2, Mail, UserPlus, X } from 'lucide-react'
import { authClient, authMessage } from '../lib/auth'
import { useAppState } from '../state/AppState'
import { AppIcon, Badge, Button, Card, EmptyBlock, inputCls } from '../components/ui'

type Profile = { id: string; email: string; role: 'owner' | 'member'; created_at: string }
type Access = { app_id: string; user_id: string; role: 'editor' | 'viewer' }
type Invite = { id: number; email: string; app_id: string | null; role: 'owner' | 'editor' | 'viewer' }
type Team = { profiles: Profile[]; access: Access[]; invites: Invite[] }

/** Owners only. Reads and writes go straight to Supabase; RLS + the grant/revoke functions enforce who may. */
export function TeamPage() {
  const { me, isOwner, apps, toast } = useAppState()
  const [team, setTeam] = useState<Team | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [target, setTarget] = useState('') // app id, or 'owner'
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer')
  const [busy, setBusy] = useState(false)

  const realApps = useMemo(() => apps.filter((a) => a.server), [apps])
  const appName = (id: string | null) => realApps.find((a) => a.id === id)?.name ?? id ?? ''

  const load = useCallback(async () => {
    const sb = await authClient()
    if (!sb) return
    const [p, a, i] = await Promise.all([
      sb.from('profiles').select('id, email, role, created_at').order('created_at'),
      sb.from('app_access').select('app_id, user_id, role'),
      sb.from('invites').select('id, email, app_id, role').order('created_at'),
    ])
    const err = p.error ?? a.error ?? i.error
    if (err) setError(err.message)
    else setTeam({ profiles: p.data as Profile[], access: a.data as Access[], invites: i.data as Invite[] })
  }, [])

  useEffect(() => { load() }, [load])

  const call = async (fn: 'grant_access' | 'revoke_access', args: Record<string, unknown>, done: string) => {
    const sb = (await authClient())!
    const { error } = await sb.rpc(fn, args)
    if (error) toast(authMessage(error))
    else {
      toast(done)
      await load()
    }
  }

  const grant = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const owner = target === 'owner'
    await call('grant_access', { target_email: email, target_app: owner ? null : target, target_role: owner ? 'owner' : role }, `Access granted to ${email}`)
    setEmail('')
    setBusy(false)
  }

  if (!me) {
    return <EmptyBlock title="Sign-in is off" body="The team is managed in Supabase Auth. Set APPHUB_SUPABASE_URL and APPHUB_SUPABASE_PUBLISHABLE_KEY to turn it on locally." />
  }
  if (!isOwner) return <EmptyBlock title="Owners only" body="Ask a workspace owner to change who can see what." />

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Team & access</h1>
      <p className="mt-1 text-[13px] text-muted">
        Sign-in is invite only. Owners see every app. Editors can change an app’s sources; viewers can only browse its data.
      </p>

      <Card className="mt-6 p-4">
        <form onSubmit={grant} className="flex flex-wrap items-end gap-2">
          <label className="min-w-56 flex-1">
            <div className="mb-1 text-xs font-medium text-muted">Email</div>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </label>
          <label>
            <div className="mb-1 text-xs font-medium text-muted">Access to</div>
            <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="" disabled>Choose…</option>
              <option value="owner">Everything (owner)</option>
              {realApps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          {target && target !== 'owner' && (
            <label>
              <div className="mb-1 text-xs font-medium text-muted">Role</div>
              <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}>
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </label>
          )}
          <Button variant="primary" type="submit" disabled={!email || !target || busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Grant access
          </Button>
        </form>
        <div className="mt-2 text-[11px] text-subtle">New people get access when they create an account with this email.</div>
      </Card>

      {error && <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2 text-xs text-red-500">{error}</div>}
      {!team && !error && <div className="mt-8 grid place-items-center text-subtle"><Loader2 size={18} className="animate-spin" /></div>}

      {team && (
        <>
          <h2 className="mt-8 mb-2 text-[13px] font-semibold">Members</h2>
          <Card className="divide-y divide-line">
            {team.profiles.map((p) => {
              const grants = team.access.filter((a) => a.user_id === p.id)
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-48 flex-1">
                    <div className="text-[13px] font-medium">{p.email}{p.id === me.id && <span className="text-subtle"> (you)</span>}</div>
                    <div className="text-[11px] text-subtle">Joined {new Date(p.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.role === 'owner' ? (
                      <Grant label={<><Crown size={11} /> Owner</>} onRemove={p.id === me.id ? undefined : () => call('revoke_access', { target_email: p.email, target_app: null }, `${p.email} is no longer an owner`)} />
                    ) : grants.length === 0 ? (
                      <span className="text-xs text-subtle">No apps</span>
                    ) : null}
                    {grants.map((g) => (
                      <Grant
                        key={g.app_id}
                        app={realApps.find((a) => a.id === g.app_id)}
                        label={`${appName(g.app_id)} · ${g.role}`}
                        onRemove={() => call('revoke_access', { target_email: p.email, target_app: g.app_id }, `Removed ${p.email} from ${appName(g.app_id)}`)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </Card>

          {team.invites.length > 0 && (
            <>
              <h2 className="mt-8 mb-2 text-[13px] font-semibold">Pending invites</h2>
              <Card className="divide-y divide-line">
                {[...new Set(team.invites.map((i) => i.email))].map((addr) => [addr, team.invites.filter((i) => i.email === addr)] as const).map(([addr, invites]) => (
                  <div key={addr} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex min-w-48 flex-1 items-center gap-2 text-[13px]"><Mail size={13} className="text-subtle" />{addr}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {invites.map((i) => (
                        <Grant
                          key={i.id}
                          app={realApps.find((a) => a.id === i.app_id)}
                          label={i.role === 'owner' ? <><Crown size={11} /> Owner</> : `${appName(i.app_id)} · ${i.role}`}
                          onRemove={() => call('revoke_access', { target_email: addr, target_app: i.app_id }, 'Invite removed')}
                        />
                      ))}
                      <Badge>Not signed up</Badge>
                    </div>
                  </div>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Grant({ label, app, onRemove }: { label: React.ReactNode; app?: Parameters<typeof AppIcon>[0]['app']; onRemove?: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-card pr-1 pl-1.5 text-xs">
      {app && <AppIcon app={app} size={14} />}
      <span className="flex items-center gap-1">{label}</span>
      {onRemove && (
        <button onClick={onRemove} className="cursor-pointer rounded p-0.5 text-subtle hover:bg-hover hover:text-fg" aria-label="Remove">
          <X size={11} />
        </button>
      )}
    </span>
  )
}
