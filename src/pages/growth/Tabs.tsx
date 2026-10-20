import { useMemo, useState, type ReactNode } from 'react'
import { Apple, Check, Copy, MoreHorizontal, Plus, Search, Smartphone, X } from 'lucide-react'
import { campaignRows, couponRows, linkRows, topReferrers, type CouponRow, type LinkRow } from '../../data/mock'
import { useAppState } from '../../state/AppState'
import { compact, cn, money, pct } from '../../lib/format'
import { Badge, Button, Card, CardHeader, Chip, Field, inputCls, Menu, MenuItem, Modal, Segmented, SectionLabel, Toggle } from '../../components/ui'
import { BarList } from '../../components/charts'

// ---------- shared table ----------

function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">
            {head.map((h, i) => (
              <th key={i} className={cn('px-4 py-2.5 font-medium', i > 0 && 'whitespace-nowrap')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&>tr:hover]:bg-hover/60 [&_td]:px-4 [&_td]:py-2.5">
          {children}
        </tbody>
      </table>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-subtle">{sub}</div>}
    </Card>
  )
}

function RowMenu({ actions }: { actions: { label: string; run: () => void }[] }) {
  return (
    <Menu
      width="w-40"
      trigger={({ toggle }) => (
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Row actions" className="h-7 w-7">
          <MoreHorizontal size={14} />
        </Button>
      )}
    >
      {(close) => actions.map((a) => <MenuItem key={a.label} onClick={() => { close(); a.run() }}>{a.label}</MenuItem>)}
    </Menu>
  )
}

// ---------- Deep links ----------

const linkStatusTone = { active: 'green', broken: 'red', expiring: 'amber', paused: 'neutral' } as const
const sources = ['All', 'Recipe', 'Campaign', 'Creator', 'Referral', 'QR', 'Manual'] as const

export function DeepLinksTab() {
  const { toast } = useAppState()
  const [rows, setRows] = useState<LinkRow[]>(linkRows)
  const [q, setQ] = useState('')
  const [source, setSource] = useState<(typeof sources)[number]>('All')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', source: 'Manual' as LinkRow['source'], dest: '' })

  const filtered = rows.filter(
    (r) => (source === 'All' || r.source === source) && (r.name.toLowerCase().includes(q.toLowerCase()) || r.url.includes(q.toLowerCase())),
  )

  const create = () => {
    if (!form.name.trim()) return
    const slug = form.slug.trim() || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setRows((r) => [{ id: `l${Date.now()}`, name: form.name, url: `pyn.to/goumi/${slug}`, source: form.source, clicks: 0, installs: 0, status: 'active', created: 'Today' }, ...r])
    setCreating(false)
    setForm({ name: '', slug: '', source: 'Manual', dest: '' })
    toast('Link created')
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total links" value={rows.length > 10 ? (4819 + rows.length - 10).toLocaleString() : '4,819'} sub="4,812 auto · 7 manual" />
        <StatCard label="Clicks" value="42.9K" sub="Last 30 days" />
        <StatCard label="Click → install" value="22.9%" sub="+0.8 pt vs prior" />
        <StatCard label="Need fixing" value="62" sub="1 broken · 61 removed recipes" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative">
            <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search links" className={cn(inputCls, 'w-56 pl-8')} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <Chip key={s} active={source === s} onClick={() => setSource(s)}>{s}</Chip>
            ))}
          </div>
          <Button variant="primary" className="ml-auto" onClick={() => setCreating(true)}>
            <Plus size={14} /> New link
          </Button>
        </div>
        <Table head={['Link', 'Source', 'Clicks', 'Installs', 'CVR', 'Status', 'Created', '']}>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="font-medium">{r.name}</div>
                <button
                  onClick={() => { navigator.clipboard?.writeText(`https://${r.url}`).catch(() => {}); toast('Copied link') }}
                  className="group flex cursor-pointer items-center gap-1 text-xs text-subtle hover:text-fg"
                >
                  {r.url} <Copy size={11} className="opacity-0 group-hover:opacity-100" />
                </button>
              </td>
              <td className="text-muted">{r.source}</td>
              <td className="tabular">{r.clicks.toLocaleString()}</td>
              <td className="tabular">{r.installs.toLocaleString()}</td>
              <td className="tabular text-muted">{r.clicks ? pct((r.installs / r.clicks) * 100) : '—'}</td>
              <td><Badge tone={linkStatusTone[r.status]}>{r.status}</Badge></td>
              <td className="text-muted">{r.created}</td>
              <td className="w-10 text-right">
                <RowMenu
                  actions={[
                    { label: 'Edit', run: () => toast(`Edit ${r.name}`) },
                    { label: r.status === 'paused' ? 'Resume' : 'Pause', run: () => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: x.status === 'paused' ? 'active' : 'paused' } : x))) },
                    { label: 'Delete', run: () => { setRows((rs) => rs.filter((x) => x.id !== r.id)); toast('Link deleted') } },
                  ]}
                />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={8} className="py-10 text-center text-xs text-subtle">No links match.</td></tr>
          )}
        </Table>
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New deep link"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={!form.name.trim()}>Create link</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Holiday newsletter" autoFocus /></Field>
          <Field label="Slug">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-subtle">pyn.to/goumi/</span>
              <input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto from name" />
            </div>
          </Field>
          <Field label="Source">
            <select className={inputCls} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as LinkRow['source'] })}>
              {sources.slice(1).map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="In-app destination"><input className={inputCls} value={form.dest} onChange={(e) => setForm({ ...form, dest: e.target.value })} placeholder="goumi://collection/holiday" /></Field>
        </div>
      </Modal>
    </div>
  )
}

// ---------- Coupons ----------

const couponTone = { live: 'green', scheduled: 'blue', ended: 'neutral' } as const

export function CouponsTab() {
  const { toast } = useAppState()
  const [rows, setRows] = useState<CouponRow[]>(couponRows)
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(couponRows.map((c) => [c.code, c.status !== 'ended'])))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Redemptions" value="1,751" sub="Last 30 days" />
        <StatCard label="Coupon revenue" value="$12.5K" sub="38% of link revenue" />
        <StatCard label="Avg discount" value="24%" />
        <StatCard label="Missing store offers" value="2" sub="AUTUMN25, BETAFREE on Android" />
      </div>
      <Card>
        <CardHeader title="Coupons" sub="Codes map to App Store offer codes and Google Play promotions" right={<Button size="sm" variant="primary" onClick={() => toast('New coupon')}><Plus size={13} /> New coupon</Button>} />
        <div className="mt-3">
          <Table head={['Code', 'Offer', 'Stores', 'Redemptions', 'Revenue', 'Window', 'Status', 'On', '']}>
            {rows.map((c) => (
              <tr key={c.code}>
                <td className="font-mono text-xs font-semibold">{c.code}</td>
                <td className="text-muted">{c.offer}</td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <StoreDot ok={c.ios} label="iOS" icon={<Apple size={11} />} />
                    <StoreDot ok={c.android} label="Android" icon={<Smartphone size={11} />} />
                  </div>
                </td>
                <td className="tabular">{c.redemptions.toLocaleString()}</td>
                <td className="tabular">{money(c.revenue)}</td>
                <td className="whitespace-nowrap text-muted">{c.window}</td>
                <td><Badge tone={couponTone[c.status]}>{c.status}</Badge></td>
                <td><Toggle checked={!!enabled[c.code]} onChange={(v) => { setEnabled((e) => ({ ...e, [c.code]: v })); toast(`${c.code} ${v ? 'enabled' : 'disabled'}`) }} /></td>
                <td className="w-10 text-right">
                  <RowMenu
                    actions={[
                      { label: 'Edit', run: () => toast(`Edit ${c.code}`) },
                      { label: 'Duplicate', run: () => setRows((r) => [...r, { ...c, code: `${c.code}_COPY`, redemptions: 0, revenue: 0, status: 'scheduled' }]) },
                      { label: 'Delete', run: () => setRows((r) => r.filter((x) => x.code !== c.code)) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
    </div>
  )
}

function StoreDot({ ok, label, icon }: { ok: boolean; label: string; icon: ReactNode }) {
  return (
    <span title={`${label}: ${ok ? 'mapped' : 'no offer mapped'}`} className={cn('inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px]', ok ? 'bg-hover text-muted' : 'bg-red-500/12 text-red-400')}>
      {icon}
      {ok ? <Check size={10} /> : <X size={10} />}
    </span>
  )
}

// ---------- Referrals ----------

export function ReferralsTab() {
  const { toast } = useAppState()
  const [program, setProgram] = useState({ enabled: true, giver: '1 month free', receiver: '30% off first year', fraud: true })

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Referral invites" value="3,412" />
        <StatCard label="Qualified" value="1,024" sub="30.0% of invites" />
        <StatCard label="Referred revenue" value="$2.7K" />
        <StatCard label="Rewards held" value="41" sub="Possible duplicates" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Top referrers" sub="By referred revenue" />
          <div className="mt-3">
            <Table head={['Code', 'Referrer', 'Invites', 'Qualified', 'Revenue', 'Flag']}>
              {topReferrers.map((r, i) => (
                <tr key={r.label}>
                  <td className="font-mono text-xs font-semibold">{r.label}</td>
                  <td className="text-muted">{r.sub}</td>
                  <td className="tabular">{[48, 31, 22, 19, 41][i]}</td>
                  <td className="tabular">{[19, 12, 7, 6, 27][i]}</td>
                  <td className="tabular">{money(r.value)}</td>
                  <td>{r.label === 'DEAL-9X' ? <Badge tone="amber">review</Badge> : <span className="text-subtle">—</span>}</td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold">Referral program</div>
            <Toggle checked={program.enabled} onChange={(v) => setProgram({ ...program, enabled: v })} />
          </div>
          <div className={cn('mt-4 space-y-3', !program.enabled && 'pointer-events-none opacity-50')}>
            <Field label="Referrer gets"><input className={inputCls} value={program.giver} onChange={(e) => setProgram({ ...program, giver: e.target.value })} /></Field>
            <Field label="Friend gets"><input className={inputCls} value={program.receiver} onChange={(e) => setProgram({ ...program, receiver: e.target.value })} /></Field>
            <div className="flex items-center justify-between rounded-lg border border-line p-3">
              <div>
                <div className="text-[13px] font-medium">Fraud checks</div>
                <div className="text-xs text-subtle">Hold rewards from same-device or burst signups</div>
              </div>
              <Toggle checked={program.fraud} onChange={(v) => setProgram({ ...program, fraud: v })} />
            </div>
            <Button variant="primary" className="w-full" onClick={() => toast('Referral program saved')}>Save changes</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ---------- Campaigns ----------

export function CampaignsTab() {
  const { toast } = useAppState()
  const [status, setStatus] = useState<'all' | 'active' | 'paused' | 'ended'>('all')
  const [paused, setPaused] = useState<string[]>([])
  const rows = campaignRows
    .map((c) => (paused.includes(c.name) ? { ...c, status: 'paused' as const } : c))
    .filter((c) => status === 'all' || c.status === status)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Segmented value={status} onChange={setStatus} options={[{ key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'paused', label: 'Paused' }, { key: 'ended', label: 'Ended' }]} />
        <Button variant="primary" onClick={() => toast('New campaign')}><Plus size={14} /> New campaign</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => {
          const roas = c.spend ? c.revenue / c.spend : null
          return (
            <Card key={c.name} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-semibold">{c.name}</div>
                  <div className="text-xs text-subtle">{c.channel}</div>
                </div>
                <Badge tone={c.status === 'active' ? 'green' : c.status === 'paused' ? 'amber' : 'neutral'}>{c.status}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Mini label="Revenue" value={money(c.revenue)} />
                <Mini label="Spend" value={c.spend ? money(c.spend) : '—'} />
                <Mini label="ROAS" value={roas ? `${roas.toFixed(1)}×` : '∞'} tone={roas !== null && roas < 1 ? 'bad' : undefined} />
                <Mini label="Installs" value={c.installs.toLocaleString()} />
                <Mini label="Install → trial" value={pct(c.trialRate)} tone={c.trialRate < 10 ? 'bad' : undefined} />
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => toast(`Open ${c.name}`)}>View</Button>
                {c.status !== 'ended' && (
                  <Button size="sm" variant="ghost" onClick={() => setPaused((p) => (p.includes(c.name) ? p.filter((x) => x !== c.name) : [...p, c.name]))}>
                    {c.status === 'paused' ? 'Resume' : 'Pause'}
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div>
      <div className="text-[11px] text-subtle">{label}</div>
      <div className={cn('tabular text-[13px] font-semibold', tone === 'bad' && 'text-red-500')}>{value}</div>
    </div>
  )
}

// ---------- Attribution ----------

const channels = [
  { label: 'Recipe links', base: 12400 },
  { label: 'Campaigns', base: 9100 },
  { label: 'Creators', base: 4300 },
  { label: 'Paid search', base: 2410 },
  { label: 'Referrals', base: 2700 },
  { label: 'QR', base: 1100 },
  { label: 'Paid social', base: 990 },
]

export function AttributionTab() {
  const [model, setModel] = useState<'first' | 'last' | 'linear'>('last')
  const [windowDays, setWindowDays] = useState<'7' | '30' | '90'>('30')

  const items = useMemo(() => {
    const tilt = { first: [1.2, 1.1, 1.3, 0.8, 0.7, 1.2, 1.1], last: [1, 1, 1, 1, 1, 1, 1], linear: [1.1, 0.95, 1.15, 0.9, 0.85, 1.05, 1] }[model]
    const w = { '7': 0.82, '30': 1, '90': 1.12 }[windowDays]
    return channels.map((c, i) => ({ label: c.label, value: Math.round(c.base * tilt[i] * w) })).sort((a, b) => b.value - a.value)
  }, [model, windowDays])
  const total = items.reduce((a, b) => a + b.value, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted">Model</span>
        <Segmented value={model} onChange={setModel} options={[{ key: 'first', label: 'First click' }, { key: 'last', label: 'Last click' }, { key: 'linear', label: 'Linear' }]} />
        <span className="ml-2 text-xs text-muted">Window</span>
        <Segmented value={windowDays} onChange={setWindowDays} options={[{ key: '7', label: '7 days' }, { key: '30', label: '30 days' }, { key: '90', label: '90 days' }]} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue by channel" sub={`${money(total)} attributed · ${model === 'first' ? 'first click' : model === 'last' ? 'last click' : 'linear'} · ${windowDays}-day window`} />
          <div className="p-4 pt-4">
            <BarList items={items} color="var(--color-mon)" format={(n) => money(n)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Match quality" sub="How installs were tied to a click" />
          <div className="space-y-4 p-4">
            {[
              ['Deterministic (link → app open)', 71, 'var(--color-acq)'],
              ['Probabilistic (IP + device, 1h)', 22, 'var(--color-ref)'],
              ['SKAdNetwork', 5, 'var(--color-cpn)'],
              ['Unmatched', 2, 'var(--line-2)'],
            ].map(([label, v, color]) => (
              <div key={label as string}>
                <div className="flex justify-between text-xs"><span>{label}</span><span className="tabular font-semibold">{v}%</span></div>
                <div className="mt-1.5 h-1.5 rounded-full bg-hover"><div className="h-full rounded-full" style={{ width: `${v}%`, background: color as string }} /></div>
              </div>
            ))}
            <p className="pt-1 text-xs text-subtle">Placeholder figures. Wire to attribution service later.</p>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ---------- Data & setup ----------

export function DataSetupTab() {
  const { toast } = useAppState()
  const [conns, setConns] = useState([
    { name: 'App Store Server Notifications', ok: true, meta: 'v2 · last event 2m ago' },
    { name: 'Google Play RTDN', ok: false, meta: 'Disconnected Oct 14' },
    { name: 'Stripe (web)', ok: true, meta: 'last event 18m ago' },
  ])
  const checklist = [
    ['Install Pyn SDK', true],
    ['Call identify() on signup', true],
    ['Configure associated domains (iOS)', true],
    ['Configure App Links (Android)', true],
    ['Send subscription events', false],
    ['Map store offer codes to coupons', false],
  ] as const
  const done = checklist.filter(([, d]) => d).length

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-semibold">Setup checklist</div>
          <span className="text-xs text-subtle">{done}/{checklist.length} done</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-hover"><div className="h-full rounded-full bg-mon" style={{ width: `${(done / checklist.length) * 100}%` }} /></div>
        <ul className="mt-4 space-y-1">
          {checklist.map(([label, ok]) => (
            <li key={label} className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-[13px]">
              <span className={cn('grid h-4 w-4 place-items-center rounded-full', ok ? 'bg-emerald-500 text-white' : 'border border-line-2')}>{ok && <Check size={10} strokeWidth={3} />}</span>
              <span className={cn(ok && 'text-muted')}>{label}</span>
              {!ok && <button onClick={() => toast(`Open guide: ${label}`)} className="ml-auto cursor-pointer text-xs text-subtle hover:text-fg">Guide →</button>}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <div className="text-[13px] font-semibold">Billing connections</div>
        <div className="mt-3 space-y-2">
          {conns.map((c, i) => (
            <div key={c.name} className="flex items-center gap-3 rounded-lg border border-line p-3">
              <span className={cn('h-2 w-2 rounded-full', c.ok ? 'bg-emerald-500' : 'bg-red-500')} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{c.name}</div>
                <div className="text-xs text-subtle">{c.meta}</div>
              </div>
              {c.ok ? (
                <Button size="sm" variant="ghost" onClick={() => toast('Test event sent')}>Test</Button>
              ) : (
                <Button size="sm" variant="primary" onClick={() => { setConns((cs) => cs.map((x, j) => (j === i ? { ...x, ok: true, meta: 'Reconnected just now' } : x))); toast('Google Play reconnected') }}>
                  Reconnect
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Recent events" sub="Placeholder stream" />
        <div className="mt-3">
          <Table head={['Event', 'User', 'Source', 'Status', 'Time']}>
            {[
              ['subscription_started', 'u_8f21…', 'App Store', 'accepted', '2m'],
              ['link_click', '—', 'pyn.to/goumi/thanks', 'accepted', '2m'],
              ['subscription_started', '—', 'Google Play', 'rejected', '4m'],
              ['identify', 'u_77ac…', 'SDK iOS 3.4.1', 'accepted', '6m'],
              ['coupon_redeemed', 'u_1b0e…', 'THANKS30', 'accepted', '9m'],
            ].map(([e, u, s, st, t], i) => (
              <tr key={i}>
                <td className="font-mono text-xs">{e}</td>
                <td className="text-muted">{u}</td>
                <td className="text-muted">{s}</td>
                <td><Badge tone={st === 'accepted' ? 'green' : 'red'}>{st}</Badge></td>
                <td className="text-muted">{t} ago</td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>

      <div className="lg:col-span-2">
        <SectionLabel>Totals</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Events today" value={compact(184_220)} />
          <StatCard label="Rejected" value="214" sub="Missing app_user_id" />
          <StatCard label="Ingest latency p95" value="1.8s" />
        </div>
      </div>
    </div>
  )
}
