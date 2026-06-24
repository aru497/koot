// book-consultation — receives a 1:1 consultation request from koott.live,
// saves it to the `consultations` table (service role), and emails you.
//
// Deploy:  supabase functions deploy book-consultation --no-verify-jwt --project-ref <ref>
//
// Required Supabase secrets:
//   SUPABASE_URL                — auto-present in the function runtime
//   SUPABASE_SERVICE_ROLE_KEY   — auto-present in the function runtime
//   RESEND_API_KEY              — your Resend API key (free tier). If unset, the
//                                 request is still saved; only the email is skipped.
// Optional:
//   CONSULT_TO_EMAIL    — where requests are emailed (default aru497@gmail.com)
//   CONSULT_FROM_EMAIL  — verified Resend sender (default onboarding@resend.dev,
//                         which Resend only delivers to your own account email)
//   KOOTT_HOST          — allowed CORS origin (default https://koott.live)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const TO_EMAIL = Deno.env.get('CONSULT_TO_EMAIL') || 'aru497@gmail.com'
const FROM_EMAIL = Deno.env.get('CONSULT_FROM_EMAIL') || 'onboarding@resend.dev'
const KOOTT_HOST = Deno.env.get('KOOTT_HOST') || 'https://koott.live'

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': KOOTT_HOST,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400, cors) }

  // Honeypot: a real user never fills the hidden "website" field. If it's set,
  // pretend success (so bots don't probe) but save/send nothing.
  if (typeof body.hp_url === 'string' && body.hp_url.trim()) {
    return json({ ok: true }, 200, cors)
  }

  // Trim + cap every field; only name + a valid email are required.
  const clean = (v: unknown, max = 2000) =>
    typeof v === 'string' ? v.trim().slice(0, max) || null : null

  const name = clean(body.name, 120)
  const email = clean(body.email, 200)
  const phone = clean(body.phone, 60)
  const study_level = clean(body.study_level, 60)
  const field_interest = clean(body.field_interest, 200)
  const message = clean(body.message, 4000)
  const preferred_time = clean(body.preferred_time, 120)
  // What the student wants. Coerce to a real boolean; leave null if absent so an
  // empty form stays blank rather than recording a fake "false".
  const asBool = (v: unknown) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null)
  const wants_call = asBool(body.wants_call)
  const wants_arrival_kit = asBool(body.wants_arrival_kit)
  const source_page = clean(body.source_page, 200)
  // user_id is client-supplied; only accept a well-formed UUID, else null.
  // (Without it, a non-UUID string would make the whole insert fail and the
  // genuine lead would be lost.)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const rawUid = clean(body.user_id, 64)
  const user_id = rawUid && UUID_RE.test(rawUid) ? rawUid.toLowerCase() : null

  if (!name) return json({ error: 'Please enter your name.' }, 400, cors)
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ error: 'Please enter a valid email.' }, 400, cors)

  // 1. Save (service role bypasses RLS)
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/consultations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      name, email, phone, study_level, field_interest, message,
      preferred_time, wants_call, wants_arrival_kit, source_page, user_id,
    }),
  })
  if (!insertRes.ok) {
    // Log internally; never echo the raw PostgREST error to the browser.
    console.error('consultations insert failed:', insertRes.status, await insertRes.text())
    return json({ error: 'Could not save your request. Please try again.' }, 500, cors)
  }

  // 2. Email you (best-effort — saving already succeeded)
  let emailed = false
  if (RESEND_API_KEY) {
    const wants: string[] = []
    if (wants_call) wants.push('1:1 call')
    if (wants_arrival_kit) wants.push('Arrival kit')
    const rows = [
      ['Name', name], ['Email', email], ['Phone', phone],
      ['Wants', wants.length ? wants.join(' + ') : null],
      ['Study level', study_level], ['Field of interest', field_interest],
      ['Preferred time', preferred_time], ['Message', message],
      ['From page', source_page], ['Signed-in user id', user_id],
    ].filter(([, v]) => v)
    const html =
      `<h2>New 1:1 consultation request</h2><table cellpadding="6" style="border-collapse:collapse">` +
      rows.map(([k, v]) =>
        `<tr><td style="font-weight:700;vertical-align:top">${k}</td><td>${escapeHtml(String(v))}</td></tr>`
      ).join('') +
      `</table>`
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: `Koott Consultations <${FROM_EMAIL}>`,
          to: [TO_EMAIL],
          reply_to: email,
          subject: `${wants.length ? wants.join(' + ') : 'Consultation'} request — ${name}`,
          html,
        }),
      })
      emailed = r.ok
    } catch { emailed = false }
  }

  return json({ ok: true, emailed }, 200, cors)
})

function json(b: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...headers } })
}
function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
