import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ExternalLink, Eye, EyeOff, Loader2, PlugZap } from 'lucide-react'
import { appColors, type AppInfo } from '../data/mock'
import { useAppState } from '../state/AppState'
import { checkKey, checkUrl, keyKind, normalizeUrl, testConnection, type TestResult } from '../lib/supabase'
import { cn } from '../lib/format'
import { AppIcon, Button, Field, inputCls, Modal } from './ui'

const platformOptions = ['iOS', 'Android', 'Web']

type Draft = { name: string; color: string; platforms: string[]; url: string; key: string }

const emptyDraft: Draft = { name: '', color: appColors[0], platforms: ['iOS'], url: '', key: '' }

function fromApp(a: AppInfo): Draft {
  return {
    name: a.name,
    color: a.color,
    platforms: a.platforms.split(' · ').filter(Boolean),
    url: a.supabase?.url ?? '',
    key: a.supabase?.key ?? '',
  }
}

/** Add-app flow (2 steps) and edit dialog, driven by `appEditor` in app state. */
export function AppEditor() {
  const { apps, appEditor, setAppEditor, addApp, updateApp, removeApp, setAppId, toast } = useAppState()
  const editing = appEditor && appEditor !== 'new' ? apps.find((a) => a.id === appEditor) : undefined
  const isNew = appEditor === 'new'

  const [step, setStep] = useState<1 | 2>(1)
  const [d, setD] = useState<Draft>(emptyDraft)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!appEditor) return
    setStep(1)
    setD(editing ? fromApp(editing) : emptyDraft)
    setShowKey(false)
    setResult(null)
    setConfirmRemove(false)
  }, [appEditor])

  const close = () => setAppEditor(null)
  const url = normalizeUrl(d.url)
  const urlError = d.url ? checkUrl(url) : null
  const keyError = d.key ? checkKey(d.key) : null
  const hasConn = !!(d.url || d.key)
  const connValid = !!d.url && !!d.key && !urlError && !keyError
  const tested = result?.ok === true

  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }))
    if ('url' in patch || 'key' in patch) setResult(null)
  }

  const runTest = async () => {
    if (!connValid) return
    setTesting(true)
    setResult(await testConnection(url, d.key.trim()))
    setTesting(false)
  }

  const save = () => {
    const supabase =
      connValid
        ? {
            url,
            key: d.key.trim(),
            verifiedAt: tested ? new Date().toISOString() : editing?.supabase?.verifiedAt,
            tables: result?.ok ? result.tables : editing?.supabase?.tables,
          }
        : undefined
    const fields = { name: d.name.trim(), color: d.color, platforms: d.platforms.join(' · '), supabase }
    if (editing) {
      // Connecting a sample app turns it into a real one.
      updateApp(editing.id, { ...fields, demo: supabase ? false : editing.demo })
      toast(`${fields.name} saved`)
    } else {
      const app = addApp(fields)
      setAppId(app.id)
      toast(supabase ? `${app.name} added and connected` : `${app.name} added. Connect Supabase any time`)
    }
    close()
  }

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
            <button
              key={c}
              type="button"
              onClick={() => set({ color: c })}
              aria-label={`Colour ${c}`}
              className={cn('h-6 w-6 cursor-pointer rounded-md ring-offset-2 ring-offset-panel', d.color === c && 'ring-2 ring-fg')}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>
      <Field label="Platforms">
        <div className="flex gap-1.5">
          {platformOptions.map((p) => {
            const on = d.platforms.includes(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => set({ platforms: on ? d.platforms.filter((x) => x !== p) : [...d.platforms, p] })}
                className={cn('h-7 cursor-pointer rounded-full border px-3 text-xs font-medium', on ? 'border-transparent bg-invert text-invert-fg' : 'border-line text-muted hover:bg-hover')}
              >
                {p}
              </button>
            )
          })}
        </div>
      </Field>
    </div>
  )

  const connection = (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Find these in Supabase under <span className="text-fg">Project Settings → API Keys</span>. Use the{' '}
        <span className="text-fg">publishable</span> (or legacy <span className="text-fg">anon</span>) key, never the secret / service_role key.
      </p>
      <Field label="Project URL">
        <input className={inputCls} value={d.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://abcd1234.supabase.co" spellCheck={false} />
        {urlError && <div className="mt-1 text-xs text-red-500">{urlError}</div>}
      </Field>
      <Field label="Publishable key">
        <div className="relative">
          <input
            className={cn(inputCls, 'pr-9 font-mono text-xs')}
            type={showKey ? 'text' : 'password'}
            value={d.key}
            onChange={(e) => set({ key: e.target.value })}
            placeholder="sb_publishable_… or eyJ…"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-subtle hover:text-fg" aria-label={showKey ? 'Hide key' : 'Show key'}>
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {keyError ? (
          <div className="mt-1 flex gap-1.5 text-xs text-red-500"><AlertTriangle size={13} className="mt-px shrink-0" />{keyError}</div>
        ) : d.key ? (
          <div className="mt-1 text-xs text-subtle">Detected: {keyKind(d.key) === 'anon' ? 'legacy anon key' : 'publishable key'}</div>
        ) : null}
      </Field>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={runTest} disabled={!connValid || testing}>
          {testing ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} Test connection
        </Button>
        {result?.ok && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-500">
            <Check size={14} /> Connected{result.schemaExposed ? ` · ${result.tables.length} tables found` : ''}
          </span>
        )}
      </div>
      {result && !result.ok && <div className="rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2 text-xs text-red-500">{result.error}</div>}
      {result?.ok && !result.schemaExposed && (
        <div className="rounded-md border border-line bg-card-2 px-3 py-2 text-xs text-muted">
          Connected, but this project doesn't list its tables to public keys. You can still open tables by name on the Database page.
        </div>
      )}
      {result?.ok && result.tables.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.tables.slice(0, 18).map((t) => <span key={t} className="rounded bg-hover px-1.5 py-0.5 font-mono text-[11px] text-muted">{t}</span>)}
          {result.tables.length > 18 && <span className="px-1 text-[11px] text-subtle">+{result.tables.length - 18} more</span>}
        </div>
      )}
      <a href="https://supabase.com/dashboard/project/_/settings/api-keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-subtle hover:text-fg">
        Open Supabase API settings <ExternalLink size={11} />
      </a>
    </div>
  )

  const nameOk = d.name.trim().length > 0
  // Partially filled connection fields block saving; empty means "connect later".
  const canSave = nameOk && (!hasConn || connValid)

  let footer
  if (isNew && step === 1) {
    footer = (
      <>
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={() => setStep(2)} disabled={!nameOk}>Next: connect Supabase</Button>
      </>
    )
  } else if (isNew) {
    footer = (
      <>
        <Button className="mr-auto" variant="ghost" onClick={() => setStep(1)}>Back</Button>
        {!hasConn && <Button onClick={save}>Skip for now</Button>}
        <Button variant="primary" onClick={save} disabled={!canSave || !hasConn}>
          {tested ? 'Add app' : 'Add without testing'}
        </Button>
      </>
    )
  } else {
    footer = confirmRemove ? (
      <>
        <span className="mr-auto self-center text-xs text-muted">Remove {editing?.name} and its saved connection?</span>
        <Button onClick={() => setConfirmRemove(false)}>Keep</Button>
        <Button variant="danger" onClick={() => { removeApp(editing!.id); toast(`${editing!.name} removed`); close() }}>Remove</Button>
      </>
    ) : (
      <>
        <Button className="mr-auto" variant="ghost" onClick={() => setConfirmRemove(true)}>Remove app</Button>
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!canSave}>Save</Button>
      </>
    )
  }

  return (
    <Modal
      open={!!appEditor && (isNew || !!editing)}
      onClose={close}
      wide
      title={isNew ? `Add app · ${step === 1 ? 'Details' : 'Connect Supabase'}` : `Edit ${editing?.name ?? 'app'}`}
      footer={footer}
    >
      {isNew ? (
        <>
          <div className="mb-4 flex gap-1.5">
            {[1, 2].map((s) => <div key={s} className={cn('h-1 flex-1 rounded-full', s <= step ? 'bg-fg' : 'bg-hover')} />)}
          </div>
          {step === 1 ? details : connection}
        </>
      ) : (
        <div className="space-y-6">
          {details}
          <div className="border-t border-line pt-5">
            <div className="mb-3 text-[13px] font-semibold">Supabase connection</div>
            {connection}
          </div>
        </div>
      )}
    </Modal>
  )
}
