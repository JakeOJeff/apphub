// AES-256-GCM with Web Crypto, so the same code runs in Node and Cloudflare Workers.
import type { SourcesInput } from '../src/shared/sources.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()

const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

const keys = new Map<string, ReturnType<typeof crypto.subtle.importKey>>()

/** `keyB64` is 32 random bytes, base64 encoded (openssl rand -base64 32). */
function aesKey(keyB64: string) {
  let k = keys.get(keyB64)
  if (!k) {
    const raw = fromB64(keyB64.trim())
    if (raw.length !== 32) throw new Error('Encryption key must be 32 bytes, base64 encoded (openssl rand -base64 32).')
    k = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
    keys.set(keyB64, k)
  }
  return k
}

export async function encrypt(keyB64: string, value: SourcesInput): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64), enc.encode(JSON.stringify(value)))
  return ['v2', toB64(iv), toB64(ct)].join('.')
}

export async function decrypt(keyB64: string, blob: string): Promise<SourcesInput> {
  const [v, iv, ct] = blob.split('.')
  if (v !== 'v2') throw new Error('Unknown vault format')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await aesKey(keyB64), fromB64(ct))
  return JSON.parse(dec.decode(pt))
}

// ---------- signed session cookie ----------

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toB64(await crypto.subtle.sign('HMAC', key, enc.encode(data))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string) {
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export async function signSession(secret: string, ttlSeconds: number) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  return `${exp}.${await hmac(secret, `session:${exp}`)}`
}

export async function verifySession(secret: string, token: string | undefined) {
  if (!token) return false
  const [exp, sig] = token.split('.')
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false
  return safeEqual(sig, await hmac(secret, `session:${exp}`))
}
