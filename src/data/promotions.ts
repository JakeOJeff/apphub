// Coupons and referral programs. Seed data is placeholder; the shapes are what the
// backend should return later.
import { createStore } from '../state/store'

export const countryOptions = ['US', 'CA', 'GB', 'AU', 'NZ', 'IE', 'DE', 'FR', 'NL', 'IN', 'JP', 'BR']

export const fmtDate = (iso?: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

const today = () => new Date().toISOString().slice(0, 10)

// ---------- coupons ----------

export type CouponStatus = 'active' | 'scheduled' | 'paused' | 'draft' | 'expired' | 'exhausted'
export type DiscountType = 'percent' | 'fixed' | 'trial'

export type Coupon = {
  id: string
  code: string
  /** Free-text note shown under the code, e.g. "Thanksgiving campaign". */
  note: string
  app: string
  status: 'active' | 'scheduled' | 'paused' | 'draft' | 'expired'
  discount: { type: DiscountType; value: number; months: number }
  plan: 'any' | 'monthly' | 'annual'
  startsAt?: string
  endsAt?: string
  /** Total redemptions allowed (or number of unique codes issued). null = unlimited. */
  usageLimit: number | null
  perUserLimit: number
  eligibility: 'new' | 'existing' | 'all'
  /** Empty = all countries. */
  countries: string[]
  campaign?: string
  referralProgram?: string
  /** Unique single-use codes generated for this coupon, if any. */
  uniqueCodes?: string[]
  /** Offer IDs configured in App Store Connect / Play Console. */
  storeOffers: { ios?: string; android?: string }
  stats: { viewed: number; applied: number; redeemed: number; trials: number; subs: number; revenue: number }
}

export function couponStatus(c: Coupon): CouponStatus {
  if (c.status === 'draft' || c.status === 'paused') return c.status
  if (c.status === 'expired' || (c.endsAt && c.endsAt < today())) return 'expired'
  if (c.usageLimit !== null && c.usageLimit > 0 && c.stats.redeemed >= c.usageLimit) return 'exhausted'
  if (c.startsAt && c.startsAt > today()) return 'scheduled'
  return c.status === 'scheduled' ? 'scheduled' : 'active'
}

export function discountLabel(c: Pick<Coupon, 'discount' | 'plan'>) {
  const { type, value, months } = c.discount
  const span = months > 1 ? ` for ${months} months` : months === 1 ? (c.plan === 'annual' ? '' : ' first month') : ''
  if (type === 'trial') return `${value} ${value === 1 ? 'month' : 'months'} free`
  const amt = type === 'percent' ? `${value}% off` : `$${value} off`
  const plan = c.plan === 'annual' ? ' annual' : c.plan === 'monthly' && months !== 1 ? ' monthly' : ''
  return `${amt}${plan}${span}`
}

export const emptyStats = { viewed: 0, applied: 0, redeemed: 0, trials: 0, subs: 0, revenue: 0 }

const c = (x: Partial<Coupon> & Pick<Coupon, 'id' | 'code' | 'app' | 'status' | 'discount'>): Coupon => ({
  note: '',
  plan: 'any',
  usageLimit: null,
  perUserLimit: 1,
  eligibility: 'all',
  countries: [],
  storeOffers: { ios: `${x.code.toLowerCase()}_ios`, android: `${x.code.toLowerCase()}-play` },
  stats: emptyStats,
  ...x,
})

export const seedCoupons: Coupon[] = [
  c({ id: 'c1', code: 'WELCOME30', app: 'Goumi', status: 'active', note: 'new users', discount: { type: 'percent', value: 30, months: 3 }, plan: 'monthly', endsAt: '2026-12-31', usageLimit: 1000, eligibility: 'new', stats: { viewed: 1800, applied: 520, redeemed: 438, trials: 210, subs: 312, revenue: 4382 } }),
  c({ id: 'c2', code: 'THANKS30', app: 'Goumi', status: 'active', note: 'Thanksgiving campaign', discount: { type: 'percent', value: 30, months: 12 }, plan: 'annual', startsAt: '2026-10-01', endsAt: '2026-11-30', usageLimit: 5000, campaign: 'Thanksgiving 2026', stats: { viewed: 2400, applied: 350, redeemed: 296, trials: 140, subs: 213, revenue: 3510 } }),
  c({ id: 'c3', code: 'PRIYA15', app: 'Goumi', status: 'active', note: 'creator code', discount: { type: 'percent', value: 15, months: 0 }, plan: 'monthly', endsAt: '2026-12-31', usageLimit: 2000, campaign: 'Creator Program Q4', referralProgram: 'p2', stats: { viewed: 700, applied: 170, redeemed: 142, trials: 96, subs: 112, revenue: 1260 } }),
  c({ id: 'c4', code: 'FOCUS50', app: 'Tally', status: 'active', discount: { type: 'percent', value: 50, months: 1 }, plan: 'monthly', endsAt: '2026-10-31', usageLimit: 600, stats: { viewed: 1100, applied: 640, redeemed: 554, trials: 180, subs: 301, revenue: 1660 } }),
  c({ id: 'c5', code: 'AUTUMN25', app: 'Goumi', status: 'scheduled', discount: { type: 'percent', value: 25, months: 3 }, startsAt: '2026-11-01', endsAt: '2026-11-30', usageLimit: 1000, storeOffers: { ios: 'autumn25_ios' } }),
  c({ id: 'c6', code: 'DRIVE10', app: 'Driftly', status: 'paused', discount: { type: 'percent', value: 10, months: 12 }, plan: 'annual', endsAt: '2026-12-01', usageLimit: 500, stats: { viewed: 300, applied: 85, redeemed: 71, trials: 30, subs: 71, revenue: 640 } }),
  c({ id: 'c7', code: 'HOLIDAY40', app: 'Goumi', status: 'draft', note: 'holiday', discount: { type: 'percent', value: 40, months: 12 }, plan: 'annual', usageLimit: 0, storeOffers: {} }),
  c({ id: 'c8', code: 'SPRING20', app: 'Goumi', status: 'expired', discount: { type: 'percent', value: 20, months: 0 }, plan: 'monthly', startsAt: '2026-03-01', endsAt: '2026-05-31', usageLimit: 1000, stats: { viewed: 1600, applied: 440, redeemed: 366, trials: 150, subs: 240, revenue: 2470 } }),
  c({ id: 'c9', code: 'BETAFREE', app: 'Goumi', status: 'active', note: 'beta testers', discount: { type: 'trial', value: 1, months: 1 }, usageLimit: 250, stats: { viewed: 740, applied: 330, redeemed: 250, trials: 0, subs: 96, revenue: 910 } }),
]

export const couponStore = createStore<Coupon[]>('pyn.coupons.v1', seedCoupons)

// ---------- referral programs ----------

export type ProgramStatus = 'active' | 'scheduled' | 'paused' | 'draft' | 'ended'

export type ReferralProgram = {
  id: string
  name: string
  app: string
  status: ProgramStatus
  startsAt?: string
  endsAt?: string
  /** Card headline, e.g. "Give $5 → Get $5". */
  headline: string
  referrerReward: string
  friendReward: string
  /** Coupon given to the referred user. */
  couponId?: string
  qualifies: 'first_payment' | 'trial_started' | 'signup'
  minPurchase: 'any' | 'monthly' | 'annual'
  eligibility: 'new' | 'all'
  maxReferrals: number | null
  countries: string[]
  campaign?: string
  linkBase: string
  funnel: { invites: number; clicks: number; installs: number; signups: number; qualified: number; rewards: number; revenue: number }
  pendingRewards: number
  rewardCost: number
}

export const qualifiesLabel: Record<ReferralProgram['qualifies'], string> = {
  first_payment: 'Referred user’s first paid period is confirmed by billing within 30 days',
  trial_started: 'Referred user starts a free trial',
  signup: 'Referred user signs up (identify() called)',
}

export const minPurchaseLabel = { any: 'Any paid plan', monthly: 'Monthly plan', annual: 'Annual plan only' }

export const emptyFunnel = { invites: 0, clicks: 0, installs: 0, signups: 0, qualified: 0, rewards: 0, revenue: 0 }

export const seedPrograms: ReferralProgram[] = [
  {
    id: 'p1', name: 'Invite Friends', app: 'Goumi', status: 'active', startsAt: '2026-01-01', endsAt: '2026-12-31',
    headline: 'Give $5 → Get $5',
    referrerReward: '$5 credit, delivered as 1 free month (App Store promotional offer · Google Play offer)',
    friendReward: '$5 off the first month · offer code REF5', couponId: undefined,
    qualifies: 'first_payment', minPurchase: 'any', eligibility: 'new', maxReferrals: 20, countries: [], linkBase: 'goumi.app/i',
    funnel: { invites: 6240, clicks: 4310, installs: 1420, signups: 1180, qualified: 611, rewards: 584, revenue: 6830 },
    pendingRewards: 27, rewardCost: 2920,
  },
  {
    id: 'p2', name: 'Creator referrals', app: 'Goumi', status: 'active', startsAt: '2026-10-01', endsAt: '2026-12-31',
    headline: '20% share → 15% off',
    referrerReward: '20% revenue share for 12 months, paid monthly',
    friendReward: '15% off monthly · coupon PRIYA15', couponId: 'c3',
    qualifies: 'first_payment', minPurchase: 'monthly', eligibility: 'new', maxReferrals: null, countries: ['US', 'CA', 'GB', 'AU'], campaign: 'Creator Program Q4', linkBase: 'goumi.app/c',
    funnel: { invites: 2100, clicks: 1650, installs: 380, signups: 300, qualified: 112, rewards: 112, revenue: 3890 },
    pendingRewards: 9, rewardCost: 952,
  },
  {
    id: 'p3', name: 'Study buddies', app: 'Tally', status: 'scheduled', startsAt: '2026-11-01',
    headline: 'Give 1 month → Get 1 month',
    referrerReward: '1 free month (App Store promotional offer)', friendReward: '1 month free trial',
    qualifies: 'trial_started', minPurchase: 'any', eligibility: 'new', maxReferrals: 10, countries: [], linkBase: 'tally.app/i',
    funnel: emptyFunnel, pendingRewards: 0, rewardCost: 0,
  },
  {
    id: 'p4', name: 'Spring invite', app: 'Goumi', status: 'ended', startsAt: '2026-03-01', endsAt: '2026-05-31',
    headline: 'Give 2 weeks → Get 2 weeks',
    referrerReward: '2 free weeks (promotional offer)', friendReward: '2-week free trial', couponId: 'c8',
    qualifies: 'first_payment', minPurchase: 'any', eligibility: 'new', maxReferrals: 10, countries: [], linkBase: 'goumi.app/i',
    funnel: { invites: 3900, clicks: 2800, installs: 820, signups: 700, qualified: 301, rewards: 301, revenue: 2950 },
    pendingRewards: 0, rewardCost: 1006,
  },
]

export const programStore = createStore<ReferralProgram[]>('pyn.programs.v1', seedPrograms)

export type Referrer = { id: string; program: string; user: string; email: string; code: string; invites: number; installs: number; qualified: number; rewards: number; revenue: number }

export const referrers: Referrer[] = [
  { id: 'r1', program: 'p1', user: 'User 84602', email: 'j••••@me.com', code: 'JESS-7K', invites: 142, installs: 61, qualified: 38, rewards: 38, revenue: 1140 },
  { id: 'r2', program: 'p1', user: 'User 84721', email: 'm••••@icloud.com', code: 'MKIT-2Q', invites: 96, installs: 40, qualified: 24, rewards: 24, revenue: 720 },
  { id: 'r3', program: 'p1', user: 'User 84530', email: 's••••@proton.me', code: 'SAMC-4R', invites: 58, installs: 22, qualified: 14, rewards: 14, revenue: 410 },
  { id: 'r4', program: 'p1', user: 'User 84390', email: 'p••••@gmail.com', code: 'PRIA-8M', invites: 51, installs: 19, qualified: 12, rewards: 11, revenue: 360 },
  { id: 'r5', program: 'p1', user: 'User 84112', email: 'd••••@mailbox.org', code: 'DEAL-9X', invites: 212, installs: 74, qualified: 41, rewards: 3, revenue: 90 },
  { id: 'r6', program: 'p2', user: 'Priya Cooks', email: 'p••••@priyacooks.com', code: 'PRIYA15', invites: 1400, installs: 260, qualified: 81, rewards: 81, revenue: 2810 },
  { id: 'r7', program: 'p2', user: 'Sam Chen', email: 's••••@gmail.com', code: 'SAMCHEN', invites: 700, installs: 120, qualified: 31, rewards: 31, revenue: 1080 },
  { id: 'r8', program: 'p4', user: 'User 80211', email: 'k••••@me.com', code: 'KIMI-3T', invites: 88, installs: 30, qualified: 19, rewards: 19, revenue: 190 },
  { id: 'r9', program: 'p4', user: 'User 80876', email: 'l••••@gmail.com', code: 'LEOB-5Z', invites: 61, installs: 21, qualified: 12, rewards: 12, revenue: 120 },
]

export type FraudSignal = {
  id: string
  program: string
  code: string
  kind: 'burst' | 'self' | 'refund'
  title: string
  count: number
  detail: string
  state: 'held' | 'review'
}

export const fraudStore = createStore<FraudSignal[]>('pyn.fraud.v1', [
  { id: 'f1', program: 'p1', code: 'DEAL-9X', kind: 'burst', title: 'Burst of qualifications', count: 27, detail: '27 referrals from DEAL-9X qualified within 40 minutes. Rewards were held automatically.', state: 'held' },
  { id: 'f2', program: 'p1', code: 'DEAL-9X', kind: 'self', title: 'Self-referral', count: 11, detail: '11 sign-ups from DEAL-9X share the referrer’s device vendor ID (IDFV / Android ID).', state: 'review' },
  { id: 'f3', program: 'p1', code: 'DEAL-9X', kind: 'refund', title: 'Refunded after reward', count: 4, detail: '4 referred users were refunded within 48 h of the referrer’s reward. Store rewards can’t be clawed back, so the referrer is capped instead.', state: 'review' },
])
