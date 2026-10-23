// Detects which tables feed each Growth metric from an app's schema, sampling a few columns
// to pick filters (production rows only, trial vs paid, install events). Cheap enough to run on every check.
import {
  AUTH_USERS,
  ident,
  isNumberType,
  isTimeType,
  type Detected,
  type Filter,
  type ListKey,
  type ListMap,
  type Mapping,
  type MetricKey,
  type MetricMap,
  type Suggestion,
  type TableSchema,
} from '../src/shared/metrics.ts'
import type { AppData } from './appData.ts'

const off = <T>(reason: string): Suggestion<T> => ({ map: null, confidence: 'low', reason })

const col = (t: TableSchema, ...names: string[]) => names.find((n) => t.columns.some((c) => c.name === n))
const colMatching = (t: TableSchema, re: RegExp, typeOk: (type: string) => boolean = () => true) =>
  t.columns.find((c) => re.test(c.name) && typeOk(c.type))?.name

/** Prefer the column that marks when the thing happened. */
function dateColumn(t: TableSchema, prefer: string[] = []) {
  const order = [...prefer, 'started_at', 'purchased_at', 'occurred_at', 'received_at', 'redeemed_at', 'created_at', 'inserted_at', 'timestamp', 'time', 'date']
  for (const n of order) if (t.columns.some((c) => c.name === n && isTimeType(c.type))) return n
  return t.columns.find((c) => isTimeType(c.type))?.name
}

const findTables = (tables: TableSchema[], include: RegExp, exclude?: RegExp) =>
  tables.filter((t) => include.test(t.name) && !exclude?.test(t.name) && dateColumn(t))

export async function detect(db: AppData, tables: TableSchema[]): Promise<Detected> {
  const sample = async (t: string, c: string) => (await db.values(t, c).catch(() => [])).map((v) => v.value)

  /** Keep production rows only when the table records an environment. */
  async function liveFilters(t: TableSchema): Promise<{ filters: Filter[]; note: string }> {
    const env = col(t, 'environment', 'env', 'store_environment')
    if (env) {
      const vals = await sample(t.name, env)
      const prod = vals.find((v) => /^prod(uction)?$/i.test(v))
      if (prod) return { filters: [{ column: env, op: 'eq', value: prod }], note: ` Only ${env} = ${prod}, so ${vals.filter((v) => v !== prod).join(' / ') || 'test'} rows are left out.` }
    }
    const sandbox = col(t, 'is_sandbox', 'sandbox', 'is_test', 'test_mode')
    if (sandbox) return { filters: [{ column: sandbox, op: 'is', value: 'false' }], note: ` Leaves out ${sandbox} rows.` }
    const live = col(t, 'livemode', 'live_mode')
    if (live) return { filters: [{ column: live, op: 'is', value: 'true' }], note: ' Live-mode rows only.' }
    return { filters: [], note: '' }
  }

  const metrics = {} as Record<MetricKey, Suggestion<MetricMap>>
  const lists = {} as Record<ListKey, Suggestion<ListMap>>

  // ---- signups: Supabase Auth is the source of truth for accounts ----
  metrics.signups = {
    map: { table: AUTH_USERS, dateColumn: 'created_at', filters: [], value: { kind: 'count' } },
    confidence: 'high',
    reason: 'Every account in Supabase Auth, by when it was created.',
  }

  // ---- subscriptions, trials, revenue ----
  const subTables = findTables(tables, /subscri/i, /event|notification|log|webhook|history|quota/i).sort((a, b) => a.name.length - b.name.length)
  const sub = subTables[0]
  if (sub) {
    const date = dateColumn(sub, ['started_at', 'purchased_at', 'original_purchase_date'])!
    const { filters, note } = await liveFilters(sub)
    const trialBool = col(sub, 'is_in_trial', 'is_trial', 'in_trial', 'trial')
    const status = col(sub, 'status', 'state')
    const statuses = status ? await sample(sub.name, status) : []
    const trialStatus = statuses.find((s) => /trial/i.test(s))

    if (trialBool || trialStatus) {
      const trialFilter: Filter = trialBool ? { column: trialBool, op: 'is', value: 'true' } : { column: status!, op: 'eq', value: trialStatus! }
      const paidFilter: Filter = trialBool ? { column: trialBool, op: 'is', value: 'false' } : { column: status!, op: 'neq', value: trialStatus! }
      metrics.trials = {
        map: { table: sub.name, dateColumn: date, filters: [...filters, trialFilter], value: { kind: 'count' } },
        confidence: 'medium',
        reason: `Rows in ${sub.name} still in their trial, by ${date}. Trials that already converted count as subscriptions instead.${note}`,
      }
      metrics.subscriptions = {
        map: { table: sub.name, dateColumn: date, filters: [...filters, paidFilter], value: { kind: 'count' } },
        confidence: 'medium',
        reason: `Rows in ${sub.name} past their trial, by ${date}.${note}`,
      }
    } else {
      metrics.trials = off(`${sub.name} doesn’t say which rows are trials. Add a filter if it can.`)
      metrics.subscriptions = {
        map: { table: sub.name, dateColumn: date, filters, value: { kind: 'count' } },
        confidence: 'medium',
        reason: `Every row in ${sub.name}, by ${date}.${note}`,
      }
    }
  } else {
    metrics.trials = off('No subscriptions table found.')
    metrics.subscriptions = off('No subscriptions table found.')
  }

  // Revenue: a payments-like table with an amount column, else a price per product on the subscriptions table.
  const amountRe = /^(amount|price|revenue|total|paid|gross|amount_paid|price_usd|amount_usd|amount_cents|price_cents|total_cents)$/i
  const payTable = findTables(tables, /payment|transaction|purchase|order|invoice|charge|revenue|receipt/i, /event|log|webhook|item/i).find((t) => colMatching(t, amountRe, isNumberType))
  if (payTable) {
    const amount = colMatching(payTable, amountRe, isNumberType)!
    const { filters, note } = await liveFilters(payTable)
    const cents = /cents/i.test(amount)
    metrics.revenue = {
      map: { table: payTable.name, dateColumn: dateColumn(payTable)!, filters, value: { kind: 'sum', column: amount, divideBy: cents ? 100 : 1 } },
      confidence: 'medium',
      reason: `Sum of ${payTable.name}.${amount}${cents ? ' (cents → dollars)' : ''}. Check the currency.${note}`,
    }
  } else if (sub && metrics.subscriptions.map) {
    const product = col(sub, 'product_id', 'product', 'plan', 'plan_id', 'sku', 'price_id', 'tier')
    metrics.revenue = product
      ? {
          map: { ...metrics.subscriptions.map, value: { kind: 'price', column: product, prices: {} } },
          confidence: 'low',
          reason: `No payments table with amounts. Revenue can be estimated as paid subscriptions × a price per ${product}: enter each price.`,
        }
      : off('No payments table with amounts, and no product column to price.')
  } else {
    metrics.revenue = off('No payments or subscriptions table found.')
  }

  // ---- clicks and installs ----
  const eventTables = findTables(tables, /click|link_event|link_open|deep_?link|dynamic_link|redirect|attribution|install|first_open/i)
  const typeOf = (t: TableSchema) => col(t, 'event_type', 'type', 'kind', 'event', 'event_name', 'name', 'action')
  let installs: Suggestion<MetricMap> | null = null
  let clicks: Suggestion<MetricMap> | null = null
  for (const t of eventTables) {
    const date = dateColumn(t)!
    const type = typeOf(t)
    const vals = type ? await sample(t.name, type) : []
    const installVals = vals.filter((v) => /install|first_open/i.test(v))
    if (/install|first_open/i.test(t.name) && !installs) {
      installs = { map: { table: t.name, dateColumn: date, filters: [], value: { kind: 'count' } }, confidence: 'medium', reason: `Every row in ${t.name}, by ${date}.` }
      continue
    }
    if (installVals.length && !installs) {
      installs = {
        map: { table: t.name, dateColumn: date, filters: [{ column: type!, op: 'in', value: installVals.join(',') }], value: { kind: 'count' } },
        confidence: 'medium',
        reason: `${t.name} rows where ${type} is ${installVals.join(' or ')}.`,
      }
    }
    if (!clicks) {
      clicks = {
        map: { table: t.name, dateColumn: date, filters: installVals.length ? [{ column: type!, op: 'neq', value: installVals[0] }] : [], value: { kind: 'count' } },
        confidence: 'medium',
        reason: `${installVals.length ? `${t.name} rows that aren’t installs` : `Every row in ${t.name}`}, by ${date}.${vals.length ? ` Seen ${type} values: ${vals.slice(0, 5).join(', ')}.` : ''}`,
      }
    }
  }
  metrics.clicks = clicks ?? off('No link click or open events table found.')
  metrics.installs = installs ?? off('No install events found. Installs usually come from App Store Connect, Play Console or an attribution SDK; map a table if you store them.')

  // ---- lists ----
  const listRules: Record<ListKey, [RegExp, RegExp?]> = {
    links: [/^(deep_|short_|dynamic_|tracked_)?links?$|^link_?codes?$/i],
    coupons: [/coupon|promo|offer_code|discount|voucher/i, /redemption|usage|event/i],
    referrals: [/referr/i, /event/i],
    campaigns: [/campaign/i, /event|stat/i],
  }
  for (const [key, [inc, exc]] of Object.entries(listRules) as [ListKey, [RegExp, RegExp?]][]) {
    const t = tables.find((x) => inc.test(x.name) && !exc?.test(x.name))
    lists[key] = t ? { map: { table: t.name, filters: [] }, confidence: 'medium', reason: `Rows from ${t.name}.` } : off(`No ${key} table found.`)
  }

  return { at: new Date().toISOString(), metrics, lists }
}

/** Checks a saved mapping against the live schema; returns an error message or null. */
export function validateMapping(m: Mapping, tables: TableSchema[]): string | null {
  const find = (name: string) => tables.find((t) => t.name === name)
  const checkCols = (t: TableSchema | undefined, cols: string[]) => {
    for (const c of cols) {
      if (!ident.test(c)) return `Invalid column name “${c}”`
      if (t && !t.columns.some((x) => x.name === c)) return `${t.name} has no column “${c}”`
    }
    return null
  }
  for (const [key, mm] of Object.entries(m.metrics ?? {})) {
    if (!mm) continue
    if (mm.table === AUTH_USERS) {
      if (mm.filters?.length) return 'Supabase Auth users can’t be filtered'
      if (mm.value.kind !== 'count') return 'Supabase Auth users can only be counted'
      continue
    }
    const t = find(mm.table)
    if (!t) return `${key}: table “${mm.table}” not found`
    const cols = [mm.dateColumn, ...(mm.filters ?? []).map((f) => f.column), ...(mm.value.kind === 'count' ? [] : [mm.value.column])]
    const err = checkCols(t, cols)
    if (err) return `${key}: ${err}`
    if (!isTimeType(t.columns.find((c) => c.name === mm.dateColumn)!.type)) return `${key}: ${mm.dateColumn} isn’t a date or time column`
  }
  for (const [key, lm] of Object.entries(m.lists ?? {})) {
    if (!lm) continue
    const t = find(lm.table)
    if (!t) return `${key}: table “${lm.table}” not found`
    const err = checkCols(t, (lm.filters ?? []).map((f) => f.column))
    if (err) return `${key}: ${err}`
  }
  return null
}
