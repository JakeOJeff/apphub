import { Check, CircleDashed, TriangleAlert, X } from 'lucide-react'
import type { CheckReport, CheckStatus } from '../shared/sources'
import { cn } from '../lib/format'

const icon: Record<CheckStatus, typeof Check> = { ok: Check, warning: TriangleAlert, error: X, not_configured: CircleDashed }
const tone: Record<CheckStatus, string> = {
  ok: 'text-emerald-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
  not_configured: 'text-subtle',
}

/** One row per data source, like goumi-web's Integrations page. */
export function CheckList({ report, hideUnconfigured }: { report: CheckReport; hideUnconfigured?: boolean }) {
  const checks = hideUnconfigured ? report.checks.filter((c) => c.status !== 'not_configured') : report.checks
  return (
    <ul className="space-y-1.5">
      {checks.map((c) => {
        const I = icon[c.status]
        return (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            <I size={13} className={cn('mt-px shrink-0', tone[c.status])} />
            <span className="w-32 shrink-0 font-medium">
              {c.name}
              {c.required && <span className="text-red-500">*</span>}
            </span>
            <span className={cn('min-w-0 flex-1', c.status === 'error' ? 'text-red-500' : 'text-muted')}>{c.detail}</span>
            {c.latencyMs !== null && <span className="tabular shrink-0 text-subtle">{c.latencyMs}ms</span>}
          </li>
        )
      })}
    </ul>
  )
}
