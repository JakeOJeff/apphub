import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Ban,
  CalendarClock,
  ChevronRight,
  Clock,
  Download,
  Grid2x2,
  Link2,
  Link2Off,
  Megaphone,
  MousePointerClick,
  ShieldAlert,
  TicketPercent,
  TrendingDown,
  Unplug,
  User,
} from 'lucide-react'
import {
  attentionItems,
  funnelSources,
  getFunnel,
  getGrowth,
  rangeLabel,
  topCampaigns,
  topCoupons,
  topLinks,
  topReferrers,
  type AttentionItem,
  type FunnelSource,
  type GrowthData,
  type RangeKey,
} from '../../data/mock'
import { useAppState } from '../../state/AppState'
import { compact, cn, money, pct } from '../../lib/format'
import { Badge, Button, Card, CardHeader, Chip, Delta, Drawer, SectionLabel } from '../../components/ui'
import { AreaChart, BarList, FunnelBars, Sparkline } from '../../components/charts'
import { LiveOverview } from './LiveOverview'

export function GrowthOverview() {
  const { app, range } = useAppState()
  const g = useMemo(() => getGrowth(app, range), [app, range])
  if (!app.demo) return <LiveOverview />

  return (
    <div className="space-y-6">
      <FlowStrip g={g} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <SectionLabel>Acquisition · tracked links</SectionLabel>
          <Card className="grid grid-cols-1 overflow-hidden sm:grid-cols-2 [&>*]:border-line sm:[&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b max-sm:[&>*]:border-b">
            <KpiTile label="Clicks" value={compact(g.clicks.value)} delta={<Delta value={g.clicks.delta} />} foot="Pyn link edge" series={g.clicks.series} color="var(--color-acq)" />
            <KpiTile label="Installs" value={compact(g.installs.value)} delta={<Delta value={g.installs.delta} />} foot="Matched to a link" series={g.installs.series} color="var(--color-acq)" />
            <KpiTile label="Signups" value={compact(g.signups.value)} delta={<Delta value={g.signups.delta} />} foot="SDK identify()" series={g.signups.series} color="var(--color-acq)" />
            <KpiTile label="Click → install" value={pct(g.ctr.value)} delta={<Delta value={g.ctr.delta} unit="pt" />} foot="Installs ÷ clicks" series={g.ctr.series} color="var(--color-acq)" />
          </Card>
        </div>
        <div>
          <SectionLabel>Monetization</SectionLabel>
          <Card className="grid grid-cols-1 overflow-hidden sm:grid-cols-2 [&>*]:border-line sm:[&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b max-sm:[&>*]:border-b">
            <KpiTile label="Trials" value={compact(g.trials.value)} delta={<Delta value={g.trials.delta} />} foot="Billing notifications" series={g.trials.series} color="var(--color-mon)" />
            <KpiTile label="Subscriptions" value={compact(g.subscriptions.value)} delta={<Delta value={g.subscriptions.delta} />} foot="Billing notifications" series={g.subscriptions.series} color="var(--color-mon)" />
            <KpiTile label="Revenue" value={money(g.revenue.value, { compact: true })} delta={<Delta value={g.revenue.delta} />} foot="Gross, from billing" series={g.revenue.series} color="var(--color-mon)" />
            <KpiTile label="LTV" value={money(g.ltv.value, { cents: true })} delta={<Delta value={g.ltv.delta} />} foot="12-month, link-acquired users" series={g.ltv.series} color="var(--color-mon)" />
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <FunnelCard g={g} />
        <ClicksInstallsCard g={g} range={range} />
      </div>

      <TopLists />

      <NeedsAttention />
    </div>
  )
}

// ---------- Flow strip ----------

type FlowStep = {
  key: string
  label: string
  icon: ReactNode
  value: string
  sub: string
  to: string
  details: [string, string][]
}

function FlowStrip({ g }: { g: GrowthData }) {
  const { app, range } = useAppState()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)

  const steps: FlowStep[] = [
    { key: 'app', label: 'App', icon: <Grid2x2 size={13} />, value: app.name, sub: 'Selected app', to: '/growth/setup', details: [['Platforms', app.platforms], ['SDK', 'v3.4.1'], ['Billing', 'App Store · Google Play']] },
    { key: 'campaigns', label: 'Campaigns', icon: <Megaphone size={13} />, value: String(g.campaigns), sub: 'Active', to: '/growth/campaigns', details: [['Top', 'Summer Cooking'], ['Spend', '$7,090'], ['Blended ROAS', '3.4×']] },
    { key: 'links', label: 'Links', icon: <Link2 size={13} />, value: g.links.total.toLocaleString(), sub: `${g.links.auto.toLocaleString()} auto · ${g.links.manual} manual`, to: '/growth/links', details: [['Auto (recipes)', g.links.auto.toLocaleString()], ['Manual', String(g.links.manual)], ['Broken', '1']] },
    { key: 'clicks', label: 'Clicks', icon: <MousePointerClick size={13} />, value: compact(g.clicks.value), sub: capitalize(rangeLabel[range]), to: '/growth/attribution', details: [['Unique', compact(g.clicks.value * 0.81)], ['iOS / Android', '62% / 38%'], ['Bot-filtered', compact(g.clicks.value * 0.03)]] },
    { key: 'installs', label: 'Installs', icon: <Download size={13} />, value: g.installs.value.toLocaleString(), sub: 'Matched to a link', to: '/growth/attribution', details: [['Deterministic', '71%'], ['Probabilistic', '29%'], ['Reinstalls', compact(g.installs.value * 0.06)]] },
    { key: 'users', label: 'Users', icon: <User size={13} />, value: g.signups.value.toLocaleString(), sub: 'Signed up', to: '/users', details: [['Identified', '100%'], ['Day-7 retained', '38%'], ['Trial started', compact(g.trials.value)]] },
    { key: 'coupons', label: 'Coupon / referral', icon: <TicketPercent size={13} />, value: g.coupons.total.toLocaleString(), sub: `${g.coupons.redeemed.toLocaleString()} redeemed · ${g.coupons.qualified.toLocaleString()} qualified`, to: '/growth/coupons', details: [['Coupons redeemed', g.coupons.redeemed.toLocaleString()], ['Referrals qualified', g.coupons.qualified.toLocaleString()], ['Rewards held', '41']] },
  ]

  const conv: Record<string, string> = {
    installs: pct(g.ctr.value),
    users: pct((g.signups.value / Math.max(1, g.installs.value)) * 100),
  }
  const sel = steps.find((s) => s.key === selected)

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold">How growth flows · {app.name}</div>
        <div className="hidden text-xs text-subtle sm:block">Select a step to open what's behind it</div>
      </div>
      <div className="flex items-stretch overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <div key={s.key} className="flex min-w-[124px] flex-1 items-stretch">
            {i > 0 && (
              <div className="flex w-9 shrink-0 flex-col items-center justify-center text-subtle">
                {conv[s.key] && <span className="tabular -mb-0.5 text-[10px] font-medium text-muted">{conv[s.key]}</span>}
                <ArrowRight size={13} />
              </div>
            )}
            <button
              onClick={() => setSelected(selected === s.key ? null : s.key)}
              className={cn(
                'min-w-0 flex-1 cursor-pointer rounded-lg border p-3 text-left transition-colors',
                selected === s.key ? 'border-fg/40 bg-hover' : 'border-line bg-card-2 hover:border-line-2',
              )}
            >
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="text-acq">{s.icon}</span>
                {s.label}
              </div>
              <div className="tabular mt-1.5 truncate text-lg font-semibold leading-tight">{s.value}</div>
              <div className="mt-1 text-[11px] leading-snug text-subtle">{s.sub}</div>
            </button>
          </div>
        ))}
      </div>

      {sel && (
        <div className="animate-fade-in mt-3 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-line bg-card-2 px-4 py-3">
          <div className="text-[13px] font-semibold">{sel.label}</div>
          {sel.details.map(([k, v]) => (
            <div key={k} className="text-xs">
              <span className="text-subtle">{k}</span> <span className="tabular ml-1 font-medium">{v}</span>
            </div>
          ))}
          <Button size="sm" className="ml-auto" onClick={() => navigate(sel.to)}>
            Open <ChevronRight size={13} />
          </Button>
        </div>
      )}
    </Card>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------- KPI tile ----------

function KpiTile({ label, value, delta, foot, series, color }: { label: string; value: string; delta: ReactNode; foot: string; series: number[]; color: string }) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {delta}
      </div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <Sparkline values={series} color={color} className="mt-2" />
      <div className="mt-1.5 text-[11px] text-subtle">{foot}</div>
    </div>
  )
}

// ---------- Funnel ----------

function FunnelCard({ g }: { g: GrowthData }) {
  const { app } = useAppState()
  const [source, setSource] = useState<FunnelSource>('all')
  const f = getFunnel(g, source, app.id)
  const steps = f.steps

  let worst = 1
  for (let i = 1; i < steps.length; i++) {
    const drop = 1 - steps[i].value / Math.max(1, steps[i - 1].value)
    const wDrop = 1 - steps[worst].value / Math.max(1, steps[worst - 1].value)
    if (drop > wDrop) worst = i
  }
  const worstDrop = (1 - steps[worst].value / Math.max(1, steps[worst - 1].value)) * 100

  return (
    <Card className="flex flex-col">
      <CardHeader title="Conversion funnel" />
      <div className="flex flex-wrap gap-1.5 px-4 pt-2.5">
        {funnelSources.map((s) => (
          <Chip key={s.key} active={source === s.key} onClick={() => setSource(s.key)}>
            {s.label}
          </Chip>
        ))}
      </div>
      <div className="px-4 pt-4">
        <FunnelBars steps={steps} />
      </div>
      <div className="mt-auto border-t border-line px-4 py-3 text-xs text-muted">
        Largest drop: {steps[worst - 1].label} → {steps[worst].label}, where {worstDrop.toFixed(0)}% don't continue. Revenue{' '}
        {money(f.revenue, { compact: true })} · {money(f.revenue / Math.max(1, steps[0].value), { cents: true })} per click.
        <div className="mt-1.5 text-[11px] text-subtle">Bar height uses a square-root scale so later steps stay visible.</div>
      </div>
    </Card>
  )
}

// ---------- Clicks & installs chart ----------

function labelsFor(range: RangeKey, n: number) {
  const end = new Date(2026, 9, 18)
  if (range === 'today') return Array.from({ length: n }, (_, i) => `${String(i).padStart(2, '0')}:00`)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end)
    d.setDate(end.getDate() - (n - 1 - i))
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })
}

function ClicksInstallsCard({ g, range }: { g: GrowthData; range: RangeKey }) {
  const labels = labelsFor(range, g.points)
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Clicks and installs"
        sub={`${compact(g.clicks.value)} clicks · ${g.installs.value.toLocaleString()} installs · ${rangeLabel[range]}`}
        right={
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-acq" />Clicks</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-mon" />Installs</span>
          </div>
        }
      />
      <div className="flex-1 px-4 pt-4 pb-2">
        <AreaChart
          height={230}
          labels={labels}
          series={[
            { name: 'Clicks', color: 'var(--color-acq)', values: g.clicks.series },
            { name: 'Installs', color: 'var(--color-mon)', values: g.installs.series },
          ]}
        />
      </div>
      <div className="flex justify-between px-4 pb-3 text-[11px] text-subtle">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(labels.length / 2)]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </Card>
  )
}

// ---------- Top lists ----------

function TopLists() {
  const navigate = useNavigate()
  const lists = [
    { title: 'Top campaigns', sub: 'By revenue', items: topCampaigns, color: 'var(--color-mon)', fmt: (n: number) => money(n), to: '/growth/campaigns' },
    { title: 'Top links', sub: 'By installs', items: topLinks, color: 'var(--color-acq)', fmt: (n: number) => n.toLocaleString(), to: '/growth/links' },
    { title: 'Top coupons', sub: 'By revenue', items: topCoupons, color: 'var(--color-cpn)', fmt: (n: number) => money(n), to: '/growth/coupons' },
    { title: 'Top referrers', sub: 'By referred revenue', items: topReferrers, color: 'var(--color-ref)', fmt: (n: number) => money(n), to: '/growth/referrals' },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {lists.map((l) => (
        <Card key={l.title}>
          <CardHeader
            title={l.title}
            sub={l.sub}
            right={
              <button onClick={() => navigate(l.to)} className="cursor-pointer text-xs text-subtle hover:text-fg">
                View all
              </button>
            }
          />
          <div className="p-4 pt-3">
            <BarList items={l.items} color={l.color} format={l.fmt} />
          </div>
        </Card>
      ))}
    </div>
  )
}

// ---------- Needs attention ----------

const attentionIcons = {
  calendar: CalendarClock,
  'trending-down': TrendingDown,
  'link-off': Link2Off,
  ban: Ban,
  alert: AlertCircle,
  unplug: Unplug,
  shield: ShieldAlert,
  clock: Clock,
}

function NeedsAttention() {
  const { toast } = useAppState()
  const [resolved, setResolved] = useState<string[]>([])
  const [open, setOpen] = useState<AttentionItem | null>(null)
  const items = attentionItems.filter((i) => !resolved.includes(i.id))

  const resolve = (item: AttentionItem, msg: string) => {
    setResolved((r) => [...r, item.id])
    setOpen(null)
    toast(msg)
  }

  return (
    <Card>
      <CardHeader title="Needs attention" right={<span className="text-xs text-subtle">{items.length} items</span>} />
      <div className="p-2">
        {items.length === 0 && <div className="py-8 text-center text-xs text-subtle">All clear. Nothing needs attention.</div>}
        {items.map((it) => {
          const Icon = attentionIcons[it.icon]
          return (
            <button
              key={it.id}
              onClick={() => setOpen(it)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-hover"
            >
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-md',
                  it.severity === 'error' ? 'bg-red-500/12 text-red-400' : 'bg-amber-500/12 text-amber-400',
                )}
              >
                <Icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{it.title}</div>
                <div className="truncate text-xs text-subtle">{it.detail}</div>
              </div>
              <span className="hidden text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle sm:block">{it.kind}</span>
              <ChevronRight size={14} className="text-subtle" />
            </button>
          )
        })}
      </div>

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title={
          open && (
            <div>
              <Badge tone={open.severity === 'error' ? 'red' : 'amber'}>{open.kind.toUpperCase()}</Badge>
              <div className="mt-2 text-[15px] font-semibold leading-snug">{open.title}</div>
            </div>
          )
        }
        footer={
          open && (
            <>
              <Button onClick={() => resolve(open, 'Snoozed for 7 days')}>Snooze</Button>
              <Button variant="primary" onClick={() => resolve(open, `${open.action} — done`)}>
                {open.action}
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="space-y-5 text-[13px]">
            <p className="text-muted">{open.detail}</p>
            <div>
              <SectionLabel>Impact (placeholder)</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {[['Users', '318'], ['Revenue at risk', '$1.2K'], ['Since', 'Oct 12']].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-line bg-card p-2.5">
                    <div className="text-[11px] text-subtle">{k}</div>
                    <div className="tabular mt-0.5 font-semibold">{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel>Timeline</SectionLabel>
              <ol className="space-y-2 border-l border-line pl-3 text-xs text-muted">
                <li>Oct 18 · Detected by Pyn checks</li>
                <li>Oct 15 · First affected event</li>
                <li>Oct 12 · Related change deployed</li>
              </ol>
            </div>
          </div>
        )}
      </Drawer>
    </Card>
  )
}
