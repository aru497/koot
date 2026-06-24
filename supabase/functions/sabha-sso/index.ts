// Sabha SSO provider — implements the DiscourseConnect provider side.
//
// Flow:
//   Sabha (unauthenticated user) → koott.live/sso.html → this function → Sabha /session/sso/callback
//
// This function:
//   1. Verifies Sabha's HMAC-SHA256 signature on the incoming SSO payload
//   2. Validates the caller's Koott session via their Supabase JWT
//   3. Signs and returns the Sabha callback URL
//
// Required Supabase secrets:
//   SABHA_SSO_SECRET  — shared secret (≥32 chars); same value as Sabha's SSO_SECRET env var
//   SABHA_HOST        — full origin of the Sabha instance, e.g. https://chat.koott.live
//   KOOTT_HOST        — (optional) koott.live origin for CORS; default https://koott.live

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SABHA_SSO_SECRET = Deno.env.get('SABHA_SSO_SECRET') || ''
const SABHA_HOST = Deno.env.get('SABHA_HOST') || ''
const KOOTT_HOST = Deno.env.get('KOOTT_HOST') || 'https://koott.live'

Deno.serve(async (req: Request) => {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': KOOTT_HOST,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, apikey, Content-Type',
    'Access-Control-Max-Age': '86400',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (!SABHA_SSO_SECRET || !SABHA_HOST) {
    return json({ error: 'Sabha SSO is not configured on this server.' }, 503, corsHeaders)
  }

  const url = new URL(req.url)
  const ssoPayload = url.searchParams.get('sso')
  const sig = url.searchParams.get('sig')

  if (!ssoPayload || !sig) {
    return json({ error: 'Missing sso or sig parameter.' }, 400, corsHeaders)
  }

  // 1. Verify Sabha's HMAC signature to confirm the request came from our Sabha instance
  const expectedSig = await hmacHex(ssoPayload, SABHA_SSO_SECRET)
  if (!timingSafeEqual(expectedSig, sig)) {
    return json({ error: 'Invalid signature.' }, 403, corsHeaders)
  }

  // 2. Decode the Sabha payload and extract the nonce + the return URL.
  //    Sabha encodes {nonce, return_sso_url} in the request; the provider must
  //    echo the nonce back to whatever return_sso_url Sabha asked for. We prefer
  //    that signed-in return URL and fall back to the configured host.
  let nonce: string | null = null
  let returnSsoUrl: string | null = null
  try {
    const decoded = atob(ssoPayload)
    const parsed = new URLSearchParams(decoded)
    nonce = parsed.get('nonce')
    returnSsoUrl = parsed.get('return_sso_url')
  } catch {
    return json({ error: 'Invalid SSO payload encoding.' }, 400, corsHeaders)
  }
  if (!nonce) {
    return json({ error: 'Missing nonce in SSO payload.' }, 400, corsHeaders)
  }
  // Only honor a return URL that points back at our own Sabha host.
  let callbackBase = `${SABHA_HOST}/session/sso/callback`
  if (returnSsoUrl) {
    try {
      const u = new URL(returnSsoUrl)
      if (u.origin === new URL(SABHA_HOST).origin) callbackBase = returnSsoUrl
    } catch { /* ignore malformed return_sso_url, use default */ }
  }

  // 3. Validate the caller's Koott session via their Supabase JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Not authenticated. Please sign in to Koott first.' }, 401, corsHeaders)
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
  })
  if (!userRes.ok) {
    return json({ error: 'Invalid or expired session. Please sign in again.' }, 401, corsHeaders)
  }
  const user = await userRes.json()

  // 4. Build the Sabha return payload
  const meta: Record<string, string> = user.user_metadata || {}

  // Derive a URL-safe username from the user's profile; fall back to a truncated user ID
  const rawUsername =
    meta.preferred_username ||
    meta.user_name ||
    (meta.full_name || meta.name || '').toLowerCase().replace(/\s+/g, '_') ||
    (user.email || '').split('@')[0]
  const username = (rawUsername.replace(/[^a-zA-Z0-9_.]/g, '_') || user.id.slice(0, 8)).slice(0, 60)

  const returnParams = new URLSearchParams({
    nonce,
    external_id: user.id,
    email: user.email || '',
    username,
  })
  if (meta.full_name || meta.name) returnParams.set('name', (meta.full_name || meta.name).slice(0, 255))
  if (meta.avatar_url) returnParams.set('avatar_url', meta.avatar_url)

  const returnPayload = btoa(returnParams.toString())
  const returnSig = await hmacHex(returnPayload, SABHA_SSO_SECRET)

  const sep = callbackBase.includes('?') ? '&' : '?'
  const callbackUrl =
    `${callbackBase}${sep}sso=${encodeURIComponent(returnPayload)}&sig=${returnSig}`

  return json({ callback_url: callbackUrl }, 200, corsHeaders)
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
