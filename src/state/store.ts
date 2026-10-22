import { useSyncExternalStore } from 'react'

/** Tiny shared store persisted to localStorage. Swap the load/save for API calls later. */
export function createStore<T>(key: string, initial: T) {
  let state: T = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw) state = JSON.parse(raw) as T
  } catch {
    /* ignore */
  }
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(next: T | ((s: T) => T)) {
      state = typeof next === 'function' ? (next as (s: T) => T)(state) : next
      try { localStorage.setItem(key, JSON.stringify(state)) } catch { /* ignore */ }
      subs.forEach((f) => f())
    },
    reset() {
      this.set(initial)
    },
    subscribe(f: () => void) {
      subs.add(f)
      return () => subs.delete(f)
    },
  }
}

export type Store<T> = ReturnType<typeof createStore<T>>

export function useStore<T>(store: Store<T>): [T, Store<T>['set']] {
  return [useSyncExternalStore(store.subscribe, store.get), store.set]
}

/** Download rows as a CSV file. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
