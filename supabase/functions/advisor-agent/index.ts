// ════════════════════════════════════════════════════════════════
//  Koott — advisor-agent  (Supabase Edge Function, Deno)
//  Natural-language course/career matcher powered by an LLM (Claude).
//
//  Flow: browser POSTs { answer, email, region } →
//    1. fetch the live occupations from Supabase (grounding data)
//    2. ask the LLM to pick the single best-matching occupation_id
//    3. save a lead (email + interest + region + match)
//    4. return { occupation_id, reason, suggested_courses, no_clear_interest }
//
//  The LLM only PICKS from real data — it never invents salaries/courses,
//  so the frontend renders the grounded result for that occupation.
//
//  LLM key (set as a function secret):
//    ANTHROPIC_API_KEY  Claude — preferred provider (~$0.005/match on Haiku)
//    GEMINI_API_KEY     Google AI Studio — optional fallback (has a FREE tier)
//  Claude is used whenever ANTHROPIC_API_KEY is set; otherwise Gemini; otherwise
//  it falls back to on-device keyword matching.
// ════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL         = Deno.env.get("AGENT_MODEL") || "claude-haiku-4-5";
const GEMINI_KEY    = Deno.env.get("GEMINI_API_KEY") || "";          // Google AI Studio (FREE tier)
const GEMINI_MODEL  = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

function validEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");
}

// Fixed-window rate limit via the hit_rate_limit SQL function. Fail-open on
// error so a DB hiccup never blocks a genuine student (the global daily cap
// is the real backstop against abuse).
async function rateOk(bucket: string, max: number, win: number): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("hit_rate_limit", { p_bucket: bucket, p_max: max, p_window_secs: win });
    if (error) { console.error("rate_limit rpc:", error.message); return true; }
    return data !== false;
  } catch (e) { console.error("rate_limit ex:", (e as Error)?.message); return true; }
}

// Verify the caller's Supabase user JWT (sent as the Bearer token). Returns the
// signed-in user, or null if missing/invalid — searching requires a real account.
async function getUser(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  try {
    // Verify via the auth REST endpoint (NOT sb.auth.* — that pulls the GoTrue
    // module into the bundle and boot-fails in the edge runtime).
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u?.id) return null;
    return { id: u.id, email: u.email || "" };
  } catch (e) { console.error("getUser:", (e as Error)?.message); return null; }
}

// Calls whichever LLM is configured: Anthropic (Claude) preferred, then Gemini. Returns raw text or "".
async function callLLM(system: string, user: string): Promise<string> {
  if (ANTHROPIC_KEY) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages: [{ role: "user", content: user }] }),
      });
      if (!r.ok) throw new Error("Anthropic HTTP " + r.status + " " + (await r.text()).slice(0, 200));
      const data = await r.json();
      return (data?.content?.[0]?.text || "").trim();
    } catch (e) { console.error("Anthropic error:", (e as Error)?.message); }
  }
  if (GEMINI_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 700, temperature: 0.4 },
        }),
      });
      if (!r.ok) throw new Error("Gemini HTTP " + r.status + " " + (await r.text()).slice(0, 200));
      const data = await r.json();
      return (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    } catch (e) { console.error("Gemini error:", (e as Error)?.message); }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")    return json({ error: "POST only" }, 405);

  let payload: { answer?: string; email?: string; region?: string };
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const answer = (payload.answer || "").trim();
  const region = (payload.region || "").trim();

  // ── Auth gate: searching requires a signed-in Koott account ──
  const authUser = await getUser(req);
  if (!authUser) return json({ error: "Please sign in to search.", code: "auth_required" }, 401);
  const email = authUser.email;

  if (!answer)            return json({ error: "Tell us what you'd like to study." }, 400);
  if (answer.length > 1500) return json({ error: "Please shorten your answer (max ~1500 characters)." }, 400);

  // ── Per-user search cap (5/day) + abuse backstops ──
  // The per-user cap is the primary lock now that a login is required; per-IP
  // burst + a global daily ceiling backstop many-accounts-behind-one-IP / distributed abuse.
  if (!(await rateOk(`adv:user:${authUser.id}`, 5, 86400)))
    return json({ error: "You've used your 5 searches for today. Please try again tomorrow.", code: "daily_limit" }, 429);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const guards = await Promise.all([
    rateOk(`adv:min:${ip}`, 6, 60),
    rateOk("adv:day:global", 2000, 86400),
  ]);
  if (guards.some((ok) => ok === false))
    return json({ error: "You're going a bit fast — please wait a minute and try again.", code: "rate_limited" }, 429);

  // ── Grounding data: the live occupations ──
  const { data: occs, error: occErr } = await sb
    .from("occupations")
    .select("id, title, cat, shortage, keywords, course_names");
  if (occErr) return json({ error: "Could not load course data: " + occErr.message }, 500);

  const compact = (occs || []).map((o) => ({
    id: o.id, title: o.title, category: o.cat, shortage: o.shortage,
    keywords: (o.keywords || []).slice(0, 8),
  }));

  // ── Ask the LLM to pick the best match ──
  let result = { occupation_id: null as string | null, reason: "", suggested_courses: [] as string[], no_clear_interest: false };

  const system =
    "You are Koott's friendly course & career advisor for international students (many from Kerala, India) planning to study in Australia. " +
    "You are given a list of occupations (each with an id, title, category, skills-shortage status, and keywords) that map to Australia's Skills Priority List. " +
    "Read the student's free-text answer about what they want to study or do, then choose the SINGLE best-matching occupation id from the list. " +
    "Prefer occupations in 'national' or 'regional' shortage when there's a reasonable tie, since they give better visa/job outcomes. " +
    "If the student expresses no clear interest or is just exploring, set no_clear_interest to true and still suggest a sensible in-shortage occupation as a gentle starting point. " +
    "Reply with STRICT JSON only, no markdown, in this shape: " +
    '{"occupation_id": string, "reason": string (2-3 warm sentences, second person), "suggested_courses": string[] (3-5 course names), "no_clear_interest": boolean}. ' +
    "occupation_id MUST be one of the provided ids.";
  const user =
    `Student answer: """${answer}"""\n` +
    (region ? `Where they're from: ${region}\n` : "") +
    `\nOccupations to choose from (JSON):\n${JSON.stringify(compact)}`;

  const text = await callLLM(system, user);
  if (text) {
    try {
      const jsonStr = text.startsWith("{") ? text : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const parsed = JSON.parse(jsonStr);
      const valid = compact.find((o) => o.id === parsed.occupation_id);
      result = {
        occupation_id: valid ? parsed.occupation_id : (compact[0]?.id ?? null),
        reason: String(parsed.reason || ""),
        suggested_courses: Array.isArray(parsed.suggested_courses) ? parsed.suggested_courses.slice(0, 6) : [],
        no_clear_interest: !!parsed.no_clear_interest,
      };
    } catch (e) { console.error("advisor-agent parse error:", (e as Error)?.message); }
  }

  // ── Fallback (no key or LLM failed): simple keyword match ──
  if (!result.occupation_id) {
    const a = answer.toLowerCase();
    let best = compact[0], bestScore = -1;
    for (const o of compact) {
      let s = 0;
      for (const k of o.keywords) if (a.includes(String(k).toLowerCase())) s += 2;
      if (a.includes(String(o.title).toLowerCase().split(" ")[0])) s += 1;
      if (o.shortage === "national") s += 1;
      if (s > bestScore) { bestScore = s; best = o; }
    }
    const matchedOcc = (occs || []).find((o) => o.id === best?.id);
    result = {
      occupation_id: best?.id ?? null,
      reason: bestScore > 0
        ? `Based on what you described, ${best?.title} looks like a strong fit — and it's in demand in Australia, which helps with both jobs and visa outcomes.`
        : `We didn't spot a specific field in your answer, so here's a popular high-demand option to explore: ${best?.title}.`,
      suggested_courses: (matchedOcc?.course_names || []).slice(0, 5),
      no_clear_interest: bestScore <= 0,
    };
  }

  // suggested_courses: if empty, borrow from the matched occupation's catalog
  if (result.occupation_id && result.suggested_courses.length === 0) {
    const occ = (occs || []).find((o) => o.id === result.occupation_id);
    result.suggested_courses = (occ?.course_names || []).slice(0, 5);
  }
  const matchedTitle = (occs || []).find((o) => o.id === result.occupation_id)?.title || null;

  // ── Save the lead (service role → bypasses RLS) ──
  await sb.from("leads").insert({
    email,
    study_interest: answer,
    region: region || null,
    matched_title: matchedTitle,
    matched_occupation_id: result.occupation_id,
    no_clear_interest: result.no_clear_interest,
    source: "advisor-agent",
  });

  return json({ ok: true, ...result, matched_title: matchedTitle });
});
