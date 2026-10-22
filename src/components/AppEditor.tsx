import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ExternalLink, Eye, EyeOff, Loader2, Lock, PlugZap } from 'lucide-react'
import { appColors } from '../data/mock'
import { useAppState } from '../state/AppState'
import { api, ApiError } from '../lib/api'
import {
  checkAnonKey,
  checkSecretKey,
  checkUrl,
  keyKind,
  normalizeUrl,
  providers,
  requiredPassed,
  type CheckReport,
  type ProviderId,
  type ServerApp,
  type SourcesInput,
} from '../shared/sources'
import { cn } from '../lib/format'
import { AppIcon, Button, Field, inputCls, Modal } from './ui'
import { CheckList } from './CheckList'

const platformOptions = ['iOS', 'Android', 'Web']

type Draft = {
  name: string
  color: string
  platforms: string[]
  url: string
  anonKey: string
  secretKey: string
  integrations: Partial<Record<ProviderId, Record<string, string>>>
}

const emptyDraft: Draft = { name: '', color: appColors[0], platforms: ['iOS'], url: '', anonKey: '', secretKey: '', integrations: {} }

function fromServer(a: ServerApp): Draft {
  // Secrets are never sent to the browser: secret fields start blank and mean "keep saved value".
  const integrations: Draft['integrations'] = {}
  for (const p of providers) {
    const v = a.sources.integrations[p.id]
    if (v) integrations[p.id] = Object.fromEntries(p.fields.map((f) => [f.key, f.secret ? '' : (v[f.key] ?? '')]))
  }
  return { name: a.name, color: a.color, platforms: a.platforms.split(' · ').filter(Boolean), url: a.sources.supabase.url, anonKey: '', secretKey: '', integrations }
}

/** Add-app flow (2 steps) and edit dialog, driven by `appEditor` in app state. */
export function AppEditor() {
  const { apps, appEditor, setAppEditor, createApp, saveApp, deleteApp, setAppId, toast, isOwner } = useAppState()
  const editing = appEditor && appEditor !== 'new' ? apps.find((a) => a.id === appEditor)?.server : undefined
  const isNew = appEditor === 'new'

  const [step, setStep] = useState<1 | 2>(1)
  const [d, setD] = useState<Draft>(emptyDraft)
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [openProvider, setOpenProvider] = useState<ProviderId | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [report, setReport] = useState<CheckReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!appEditor) return
    setStep(1)
    setD(editing ? fromServer(editing) : emptyDraft)
    setReveal({})
    setOpenProvider(null)
    setReport(editing?.lastCheck ?? null)
    setError(null)
    setConfirmRemove(false)
  }, [appEditor]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setAppEditor(null)
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }))
    if (!('name' in patch || 'color' in patch || 'platforms' in patch)) setReport(null)
  }
  const setIntegration = (id: ProviderId, key: string, value: string) => {
    setD((x) => ({ ...x, integrations: { ...x.integrations, [id]: { ...x.integrations[id], [key]: value } } }))
    setReport(null)
  }

  const url = normalizeUrl(d.url)
  // When editing, blank secret fields keep the saved value, so only validate what was typed.
  const urlError = d.url ? checkUrl(url) : null
  const anonError = d.anonKey ? checkAnonKey(d.anonKey) : null
  const secretError = d.secretKey ? checkSecretKey(d.secretKey) : null
  const sourcesFilled = editing ? !!d.url : !!d.url && !!d.anonKey && !!d.secretKey
  const sourcesValid = sourcesFilled && !urlError && !anonError && !secretError
  const passed = report ? requiredPassed(report) : false

  const sourcesInput = (): SourcesInput => ({
    supabase: { url, anonKey: d.anonKey.trim(), secretKey: d.secretKey.trim() },
    integrations: d.integrations,
  })

  const runCheck = async () => {
    setChecking(true)
    setError(null)
    try {
      setReport(await api.checkSources(sourcesInput(), editing?.id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    const fields = { name: d.name.trim(), color: d.color, platforms: d.platforms.join(' · ') }
    try {
      if (editing) {
        // Only resend sources if they were checked in this session (i.e. something changed).
        const changed = report && report !== editing.lastCheck
        await saveApp(editing.id, { ...fields, ...(changed ? { sources: sourcesInput() } : {}) })
        toast(`${fields.name} saved`)
      } else {
        const app = await createApp({ ...fields, sources: sourcesInput() })
        setAppId(app.id)
        toast(`${app.name} added`)
      }
      close()
    } catch (e) {
      if (e instanceof ApiError && e.report) setReport(e.report)
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const secretInput = (id: string, value: string, onChange: (v: string) => void, placeholder: string, savedHint?: string) => (
    <div className="relative">
      <input
        className={cn(inputCls, 'pr-9 font-mono text-xs')}
        type={reveal[id] ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={savedHint ? `Saved: ${savedHint}. Leave blank to keep` : placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      <button type="button" onClick={() => setReveal((r) => ({ ...r, [id]: !r[id] }))} className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-subtle hover:text-fg" aria-label={reveal[id] ? 'Hide' : 'Show'}>
        {reveal[id] ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )

  const fieldError = (msg: string | null) => msg && <div className="mt-1 flex gap-1.5 text-xs text-red-500"><AlertTriangle size={13} className="mt-px shrink-0" />{msg}</div>

  const details = (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AppIcon app={{ name: d.name || '?', color: d.color }} size={40} />
        <div className="flex-1">
          <Field label="App name">
            <input className={inputCls} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Goumi" autoFocus />
          </Field>
        </div>
      </div>
      <Field label="Colour">
        <div className="flex gap-2">
          {appColors.map((c) => (
            <button key={c} type="button" onClick={() => set({ color: c })} aria-label={`Colour ${c}`} className={cn('h-6 w-6 cursor-pointer rounded-md ring-offset-2 ring-offset-panel', d.color === c && 'ring-2 ring-fg')} style={{ background: c }} />
          ))}
        </div>
      </Field>
      <Field label="Platforms">
        <div className="flex gap-1.5">
          {platformOptions.map((p) => {
            const on = d.platforms.includes(p)
            return (
              <button key={p} type="button" onClick={() => set({ platforms: on ? d.platforms.filter((x) => x !== p) : [...d.platforms, p] })} className={cn('h-7 cursor-pointer rounded-full border px-3 text-xs font-medium', on ? 'border-transparent bg-invert text-invert-fg' : 'border-line text-muted hover:bg-hover')}>
                {p}
              </button>
            )
          })}
        </div>
      </Field>
    </div>
  )

  const saved = editing?.sources

  const sources = (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-[13px] font-semibold">Supabase <span className="ml-1 text-[11px] font-normal text-red-500">required</span></div>
          <a href="https://supabase.com/dashboard/project/_/settings/api-keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-subtle hover:text-fg">
            API keys <ExternalLink size={11} />
          </a>
        </div>
        <Field label="Project URL">
          <input className={inputCls} value={d.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://abcd1234.supabase.co" spellCheck={false} />
          {fieldError(urlError)}
        </Field>
        <Field label="Publishable key">
          {secretInput('anon', d.anonKey, (v) => set({ anonKey: v }), 'sb_publishable_… or anon eyJ…', saved?.supabase.anonKey)}
          {fieldError(anonError) || (d.anonKey && <div className="mt-1 text-xs text-subtle">Detected: {keyKind(d.anonKey) === 'anon' ? 'legacy anon key' : 'publishable key'}</div>)}
        </Field>
        <Field label="Secret key">
          {secretInput('secret', d.secretKey, (v) => set({ secretKey: v }), 'sb_secret_… or service_role eyJ…', saved?.supabase.secretKey)}
          {fieldError(secretError)}
          <div className="mt-1 flex gap-1.5 text-xs text-subtle">
            <Lock size={12} className="mt-px shrink-0" />
            Encrypted and kept on the apphub server only. Used for reads that bypass RLS, like goumi-web’s admin.
          </div>
        </Field>
      </section>

      <section className="space-y-2">
        <div className="text-[13px] font-semibold">Integrations <span className="ml-1 text-[11px] font-normal text-subtle">optional · health checks</span></div>
        {providers.map((p) => {
          const open = openProvider === p.id
          const values = d.integrations[p.id] ?? {}
          const savedValues = saved?.integrations[p.id]
          const configured = Object.values(values).some(Boolean) || !!savedValues
          return (
            <div key={p.id} className="rounded-lg border border-line">
              <button type="button" onClick={() => setOpenProvider(open ? null : p.id)} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left">
                <span className="text-[13px] font-medium">{p.name}</span>
                {configured && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                <span className="ml-auto truncate text-xs text-subtle">{configured ? 'Configured' : 'Not configured'}</span>
                <ChevronDown size={14} className={cn('text-subtle transition-transform', open && 'rotate-180')} />
              </button>
              {open && (
                <div className="space-y-3 border-t border-line p-3">
                  <div className="text-xs text-subtle">{p.blurb}</div>
                  {p.fields.map((f) => (
                    <Field key={f.key} label={f.label}>
                      {f.secret
                        ? secretInput(`${p.id}.${f.key}`, values[f.key] ?? '', (v) => setIntegration(p.id, f.key, v), f.placeholder, savedValues?.[f.key])
                        : <input className={cn(inputCls, 'font-mono text-xs')} value={values[f.key] ?? ''} onChange={(e) => setIntegration(p.id, f.key, e.target.value)} placeholder={f.placeholder} spellCheck={false} />}
                    </Field>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <div className="space-y-3 rounded-lg border border-line bg-card-2 p-3">
        <div className="flex items-center gap-3">
          <Button type="button" onClick={runCheck} disabled={!sourcesValid || checking}>
            {checking ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} Check sources
          </Button>
          <span className="text-xs text-subtle">
            {!sourcesFilled ? 'Fill in the three Supabase fields first.' : report ? (passed ? 'Required sources passed.' : 'Fix the failed Supabase sources to continue.') : 'Run a check before saving.'}
          </span>
        </div>
        {report && <CheckList report={report} />}
      </div>
      {error && <div className="rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2 text-xs text-red-500">{error}</div>}
    </div>
  )

  const nameOk = d.name.trim().length > 0
  const sourcesTouched = editing && report !== editing.lastCheck
  let footer
  if (isNew && step === 1) {
    footer = (
      <>
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={() => setStep(2)} disabled={!nameOk}>Next: data sources</Button>
      </>
    )
  } else if (isNew) {
    footer = (
      <>
        <Button className="mr-auto" variant="ghost" onClick={() => setStep(1)}>Back</Button>
        <Button variant="primary" onClick={save} disabled={!passed || saving}>
          {saving && <Loader2 size={14} className="animate-spin" />} Add app
        </Button>
      </>
    )
  } else {
    footer = confirmRemove ? (
      <>
        <span className="mr-auto self-center text-xs text-muted">Remove {editing?.name} and delete its saved sources?</span>
        <Button onClick={() => setConfirmRemove(false)}>Keep</Button>
        <Button variant="danger" onClick={async () => { await deleteApp(editing!.id); toast(`${editing!.name} removed`); close() }}>Remove</Button>
      </>
    ) : (
      <>
        {isOwner ? <Button className="mr-auto" variant="ghost" onClick={() => setConfirmRemove(true)}>Remove app</Button> : <span className="mr-auto" />}
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!nameOk || saving || (!!sourcesTouched && !passed)}>
          {saving && <Loader2 size={14} className="animate-spin" />} Save
        </Button>
      </>
    )
  }

  return (
    <Modal
      open={!!appEditor && (isNew || !!editing)}
      onClose={close}
      wide
      title={isNew ? `Add app · ${step === 1 ? 'Details' : 'Data sources'}` : `Edit ${editing?.name ?? 'app'}`}
      footer={footer}
    >
      {isNew ? (
        <>
          <div className="mb-4 flex gap-1.5">
            {[1, 2].map((s) => <div key={s} className={cn('h-1 flex-1 rounded-full', s <= step ? 'bg-fg' : 'bg-hover')} />)}
          </div>
          {step === 1 ? details : sources}
        </>
      ) : (
        <div className="space-y-6">
          {details}
          <div className="border-t border-line pt-5">{sources}</div>
        </div>
      )}
    </Modal>
  )
}
