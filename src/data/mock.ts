// Placeholder data for the UI. Everything here is generated deterministically
// so numbers stay stable between renders. Replace with real API calls later.

export type RangeKey = 'today' | '7d' | '30d' | '90d' | 'custom'

export type SupabaseConnection = {
  url: string
  /** Public key only: legacy `anon` JWT or `sb_publishable_…`. Never a service_role / secret key. */
  key: string
  /** ISO time of the last successful connection test. */
  verifiedAt?: string
  /** Tables seen when the connection was last tested (empty if the schema isn't exposed). */
  tables?: string[]
}

export type AppInfo = {
  id: string
  name: string
  color: string
  glyph?: 'cherry' | 'wallet' | 'moon'
  platforms: string
  /** Relative size versus Goumi (1 = the numbers in the reference design). Drives placeholder metrics. */
  scale: number
  /** Built-in sample apps; they have no backend. */
  demo?: boolean
  supabase?: SupabaseConnection
}

export const demoApps: AppInfo[] = [
  { id: 'goumi', name: 'Goumi', color: '#16a34a', glyph: 'cherry', platforms: 'iOS · Android', scale: 1, demo: true },
  { id: 'tally', name: 'Tally', color: '#2563eb', glyph: 'wallet', platforms: 'iOS', scale: 0.42, demo: true },
  { id: 'driftly', name: 'Driftly', color: '#7c3aed', glyph: 'moon', platforms: 'iOS · Android · Web', scale: 0.18, demo: true },
]

export const appColors = ['#16a34a', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#ca8a04', '#52525b']

export const ranges: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'custom', label: 'Custom' },
]

const rangeDays: Record<RangeKey, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90, custom: 14 }

export const rangeLabel: Record<RangeKey, string> = {
  today: 'today',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
  custom: 'Oct 5 – Oct 18',
}

// ---------- seeded random ----------

function hash(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rng(seed: string) {
  let a = hash(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A noisy series of `n` points whose values sum to `total`. */
export function series(seed: string, n: number, total: number, opts: { trend?: number; noise?: number; spikes?: boolean } = {}) {
  const r = rng(seed)
  const { trend = 0, noise = 0.25, spikes = false } = opts
  const raw: number[] = []
  let walk = 1
  for (let i = 0; i < n; i++) {
    walk = Math.max(0.35, walk + (r() - 0.5) * noise)
    let v = walk * (1 + trend * (i / Math.max(1, n - 1) - 0.5))
    if (spikes && r() > 0.88) v *= 1.25 + r() * 0.5
    raw.push(v)
  }
  const sum = raw.reduce((a, b) => a + b, 0)
  return raw.map((v) => (v / sum) * total)
}

// ---------- growth metrics ----------

export type Metric = { value: number; delta: number; series: number[] }

export type GrowthData = {
  points: number
  campaigns: number
  links: { total: number; auto: number; manual: number }
  clicks: Metric
  installs: Metric
  signups: Metric
  ctr: Metric
  trials: Metric
  subscriptions: Metric
  revenue: Metric
  ltv: Metric
  coupons: { total: number; redeemed: number; qualified: number }
}

export function getGrowth(app: AppInfo, range: RangeKey): GrowthData {
  const days = rangeDays[range]
  const f = (days / 30) * app.scale
  const points = range === 'today' ? 24 : days
  const key = `${app.id}:${range}`
  const r = rng(key)
  const d = (base: number) => Math.round((base + (r() - 0.5) * 6) * 10) / 10

  const mk = (name: string, total: number, delta: number, opts?: Parameters<typeof series>[3]): Metric => ({
    value: total,
    delta,
    series: series(`${key}:${name}`, points, total, opts),
  })

  const clicks = Math.round(42900 * f)
  const installs = Math.round(9824 * f)
  const signups = Math.round(8045 * f)
  const trials = Math.round(1940 * f)
  const subs = Math.round(903 * f)
  const revenue = 33000 * f

  const clickSeries = series(`${key}:clicks`, points, clicks, { spikes: true, noise: 0.35 })
  const installSeries = series(`${key}:installs`, points, installs, { noise: 0.2 })

  return {
    points,
    campaigns: app.id === 'goumi' ? 4 : app.id === 'tally' ? 2 : 1,
    links: { total: Math.round(4819 * app.scale), auto: Math.round(4812 * app.scale), manual: 7 },
    clicks: { value: clicks, delta: d(14.2), series: clickSeries },
    installs: { value: installs, delta: d(11.8), series: installSeries },
    signups: mk('signups', signups, d(9.6)),
    ctr: {
      value: (installs / clicks) * 100,
      delta: Math.round((0.8 + (r() - 0.5)) * 10) / 10,
      series: clickSeries.map((c, i) => (installSeries[i] / Math.max(1, c)) * 100),
    },
    trials: mk('trials', trials, d(7.1)),
    subscriptions: mk('subs', subs, d(10.4)),
    revenue: mk('revenue', revenue, d(12.9)),
    ltv: { value: 58.4 * (0.8 + app.scale * 0.2), delta: d(3.2), series: series(`${key}:ltv`, points, points * 58, { noise: 0.08 }) },
    coupons: { total: Math.round(2516 * f), redeemed: Math.round(1492 * f), qualified: Math.round(1024 * f) },
  }
}

// ---------- funnel ----------

export const funnelSources = [
  { key: 'all', label: 'All', share: 1 },
  { key: 'recipe', label: 'Recipe', share: 0.38 },
  { key: 'campaign', label: 'Campaign', share: 0.24 },
  { key: 'creator', label: 'Creator', share: 0.14 },
  { key: 'referral', label: 'Referral', share: 0.1 },
  { key: 'qr', label: 'QR', share: 0.06 },
  { key: 'manual', label: 'Manual', share: 0.08 },
] as const

export type FunnelSource = (typeof funnelSources)[number]['key']

export function getFunnel(g: GrowthData, source: FunnelSource, appId: string) {
  const src = funnelSources.find((s) => s.key === source)!
  const r = rng(`${appId}:${source}`)
  const j = (x: number) => (source === 'all' ? x : x * (0.75 + r() * 0.5))
  const clicks = Math.round(g.clicks.value * src.share)
  const installs = Math.round(clicks * Math.min(0.9, j(g.installs.value / Math.max(1, g.clicks.value))))
  const signups = Math.round(installs * Math.min(0.95, j(g.signups.value / Math.max(1, g.installs.value))))
  const trials = Math.round(signups * Math.min(0.9, j(g.trials.value / Math.max(1, g.signups.value))))
  const subs = Math.round(trials * Math.min(0.9, j(g.subscriptions.value / Math.max(1, g.trials.value))))
  const revenue = (g.revenue.value * src.share * subs) / Math.max(1, g.subscriptions.value * src.share)
  return {
    revenue,
    steps: [
      { label: 'Clicks', value: clicks, color: 'var(--color-acq)' },
      { label: 'Installs', value: installs, color: 'var(--color-acq)' },
      { label: 'Signups', value: signups, color: 'var(--color-acq)' },
      { label: 'Trials', value: trials, color: 'var(--color-mon)' },
      { label: 'Subscriptions', value: subs, color: 'var(--color-mon)' },
    ],
  }
}

// ---------- top lists ----------

export type TopItem = { label: string; value: number; sub?: string }

export const topCampaigns: TopItem[] = [
  { label: 'Summer Cooking', value: 9120 },
  { label: 'Thanksgiving 2026', value: 7980 },
  { label: 'Creator Program Q4', value: 3890 },
  { label: 'Apple Search Ads · Brand', value: 2410 },
  { label: 'TikTok · Pantry hacks', value: 390 },
]

export const topLinks: TopItem[] = [
  { label: 'SUMMER_RECIPE_CAMPAIGN', value: 3180 },
  { label: 'THANKSGIVING_2026', value: 2102 },
  { label: 'Creator · Priya Cooks', value: 902 },
  { label: 'Weeknight garlic pasta', value: 640 },
  { label: 'Referral · Invite a friend', value: 611 },
]

export const topCoupons: TopItem[] = [
  { label: 'WELCOME30', value: 4382 },
  { label: 'THANKS30', value: 3510 },
  { label: 'SPRING20', value: 2470 },
  { label: 'PRIYA15', value: 1260 },
  { label: 'BETAFREE', value: 910 },
]

export const topReferrers: TopItem[] = [
  { label: 'JESS-7K', sub: 'j••••@me.com', value: 1140 },
  { label: 'MKIT-2Q', sub: 'm••••@icloud.com', value: 720 },
  { label: 'SAMC-4R', sub: 's••••@proton.me', value: 410 },
  { label: 'PRIA-8M', sub: 'p••••@gmail.com', value: 360 },
  { label: 'DEAL-9X', sub: 'd••••@mailbox.org', value: 90 },
]

// ---------- needs attention ----------

export type AttentionKind = 'coupon' | 'campaign' | 'link' | 'event' | 'billing' | 'referral'
export type Severity = 'warn' | 'error'

export type AttentionItem = {
  id: string
  kind: AttentionKind
  severity: Severity
  icon: 'calendar' | 'trending-down' | 'link-off' | 'ban' | 'alert' | 'unplug' | 'shield' | 'clock'
  title: string
  detail: string
  action: string
}

export const attentionItems: AttentionItem[] = [
  { id: 'a1', kind: 'coupon', severity: 'warn', icon: 'calendar', title: 'AUTUMN25 starts Nov 1 without a Google Play offer', detail: 'Android users would see "code not valid". Map an offer ID before launch.', action: 'Map offer ID' },
  { id: 'a2', kind: 'campaign', severity: 'error', icon: 'trending-down', title: 'TikTok · Pantry hacks returns 0.2× its spend', detail: '$1,840 spent, $390 revenue. Install → trial is 6.7% against a 22.7% average.', action: 'Pause campaign' },
  { id: 'a3', kind: 'link', severity: 'error', icon: 'link-off', title: 'Blog · Holiday menu points to a 404', detail: '318 clicks since Oct 12 reached an error page.', action: 'Edit destination' },
  { id: 'a4', kind: 'link', severity: 'warn', icon: 'ban', title: '61 recipe links point to removed recipes', detail: 'Recipes were unpublished or deleted in the app. Links fall back to the web and still get clicks.', action: 'Review links' },
  { id: 'a5', kind: 'event', severity: 'error', icon: 'alert', title: '214 subscription_started events rejected', detail: "Missing app_user_id from Android build 2041. Their revenue isn't attributed yet.", action: 'View events' },
  { id: 'a6', kind: 'billing', severity: 'error', icon: 'unplug', title: 'Google Play notifications disconnected', detail: "Android redemptions and renewals aren't confirmed, so coupons and referrals stay pending.", action: 'Reconnect' },
  { id: 'a7', kind: 'referral', severity: 'warn', icon: 'shield', title: '41 referrals from DEAL-9X look duplicated', detail: "27 qualified in 40 minutes, 11 from the referrer's own device. Rewards held.", action: 'Review referrals' },
  { id: 'a8', kind: 'link', severity: 'warn', icon: 'clock', title: 'Farmers market flyer expires in 6 days', detail: 'Printed QR codes stop routing to the collection on Oct 20.', action: 'Extend expiry' },
]

// ---------- tab tables ----------

export type LinkRow = {
  id: string
  name: string
  url: string
  source: 'Recipe' | 'Campaign' | 'Creator' | 'Referral' | 'QR' | 'Manual'
  clicks: number
  installs: number
  status: 'active' | 'broken' | 'expiring' | 'paused'
  created: string
}

export const linkRows: LinkRow[] = [
  { id: 'l1', name: 'SUMMER_RECIPE_CAMPAIGN', url: 'pyn.to/goumi/summer', source: 'Campaign', clicks: 14820, installs: 3180, status: 'active', created: 'Jun 2' },
  { id: 'l2', name: 'THANKSGIVING_2026', url: 'pyn.to/goumi/thanks', source: 'Campaign', clicks: 9210, installs: 2102, status: 'active', created: 'Oct 1' },
  { id: 'l3', name: 'Creator · Priya Cooks', url: 'pyn.to/goumi/priya', source: 'Creator', clicks: 3870, installs: 902, status: 'active', created: 'Aug 14' },
  { id: 'l4', name: 'Weeknight garlic pasta', url: 'pyn.to/r/garlic-pasta', source: 'Recipe', clicks: 2944, installs: 640, status: 'active', created: 'Auto' },
  { id: 'l5', name: 'Referral · Invite a friend', url: 'pyn.to/goumi/invite', source: 'Referral', clicks: 2210, installs: 611, status: 'active', created: 'May 9' },
  { id: 'l6', name: 'Blog · Holiday menu', url: 'pyn.to/goumi/holiday', source: 'Manual', clicks: 318, installs: 0, status: 'broken', created: 'Oct 12' },
  { id: 'l7', name: 'Farmers market flyer', url: 'pyn.to/goumi/market', source: 'QR', clicks: 1104, installs: 271, status: 'expiring', created: 'Sep 3' },
  { id: 'l8', name: 'One-pan lemon chicken', url: 'pyn.to/r/lemon-chicken', source: 'Recipe', clicks: 1890, installs: 402, status: 'active', created: 'Auto' },
  { id: 'l9', name: 'TikTok · Pantry hacks', url: 'pyn.to/goumi/tt-pantry', source: 'Campaign', clicks: 4120, installs: 288, status: 'paused', created: 'Sep 20' },
  { id: 'l10', name: 'Store window QR', url: 'pyn.to/goumi/window', source: 'QR', clicks: 512, installs: 119, status: 'active', created: 'Jul 30' },
]

export type CouponRow = {
  code: string
  offer: string
  ios: boolean
  android: boolean
  redemptions: number
  revenue: number
  status: 'live' | 'scheduled' | 'ended'
  window: string
}

export const couponRows: CouponRow[] = [
  { code: 'WELCOME30', offer: '30% off first year', ios: true, android: true, redemptions: 612, revenue: 4382, status: 'live', window: 'Always on' },
  { code: 'THANKS30', offer: '30% off annual', ios: true, android: true, redemptions: 488, revenue: 3510, status: 'live', window: 'Oct 1 – Nov 30' },
  { code: 'SPRING20', offer: '20% off annual', ios: true, android: true, redemptions: 340, revenue: 2470, status: 'ended', window: 'Mar 1 – May 31' },
  { code: 'PRIYA15', offer: '15% off · creator', ios: true, android: true, redemptions: 171, revenue: 1260, status: 'live', window: 'Always on' },
  { code: 'BETAFREE', offer: '3 months free', ios: true, android: false, redemptions: 140, revenue: 910, status: 'live', window: 'Invite only' },
  { code: 'AUTUMN25', offer: '25% off annual', ios: true, android: false, redemptions: 0, revenue: 0, status: 'scheduled', window: 'Nov 1 – Nov 30' },
]

export type CampaignRow = {
  name: string
  channel: string
  spend: number
  revenue: number
  installs: number
  trialRate: number
  status: 'active' | 'paused' | 'ended'
}

export const campaignRows: CampaignRow[] = [
  { name: 'Summer Cooking', channel: 'Organic · Social', spend: 0, revenue: 9120, installs: 3180, trialRate: 24.1, status: 'ended' },
  { name: 'Thanksgiving 2026', channel: 'Email · Social', spend: 1200, revenue: 7980, installs: 2102, trialRate: 26.3, status: 'active' },
  { name: 'Creator Program Q4', channel: 'Creators', spend: 2400, revenue: 3890, installs: 1310, trialRate: 21.9, status: 'active' },
  { name: 'Apple Search Ads · Brand', channel: 'Paid search', spend: 1650, revenue: 2410, installs: 820, trialRate: 23.4, status: 'active' },
  { name: 'TikTok · Pantry hacks', channel: 'Paid social', spend: 1840, revenue: 390, installs: 288, trialRate: 6.7, status: 'active' },
]

export const notifications = [
  { id: 'n1', title: 'Revenue dipped 18% yesterday', body: 'Mostly Android renewals — likely the Google Play disconnect.', time: '2h' },
  { id: 'n2', title: 'THANKS30 passed 450 redemptions', body: 'Now the #2 coupon by revenue this month.', time: '5h' },
  { id: 'n3', title: 'New creator joined', body: 'Sam Chen accepted the Creator Program Q4 invite.', time: '1d' },
]
