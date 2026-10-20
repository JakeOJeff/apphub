export function compact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}K`
  return Math.round(n).toLocaleString('en-US')
}

export function money(n: number, opts: { compact?: boolean; cents?: boolean } = {}) {
  if (opts.compact && Math.abs(n) >= 10_000) return `$${(n / 1000).toFixed(1)}K`
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  })}`
}

export function pct(n: number, digits = 1) {
  return `${n.toFixed(digits)}%`
}

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}
