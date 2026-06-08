// ════════════════════════════════════════════════════════════════
//  Koott — sync-gov-data  (Supabase Edge Function, Deno)
//  Pulls REAL Australian government data server-side (no browser CORS,
//  secrets stay private) and upserts it into Koott's tables.
//
//  Sources:
//    • Skills Priority List (occupation shortage status) — data.gov.au CKAN
//    • ABS earnings (salaries)                            — ABS Data API (optional, needs key)
//
//  Design: this NEVER deletes rows. It updates the authoritative fields
//  (shortage status, salaries) on occupations we already track, matched
//  by ANZSCO code, and leaves the curated enrichment (keywords, course
//  suggestions, visa pathways) intact. Missing config = skip, not fail.
// ════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// data.gov.au CKAN datastore resource id for the Skills Priority List
// occupation table. Find it on data.gov.au (see LIVE-DATA-SETUP.md) and
// set it as a function secret: SPL_RESOURCE_ID
const SPL_RESOURCE_ID = Deno.env.get("SPL_RESOURCE_ID") || "";
const CKAN = "https://data.gov.au/data/api/3/action/datastore_search";

// Optional ABS Data API (salaries). Leave unset to skip.
const ABS_API_KEY     = Deno.env.get("ABS_API_KEY") || "";
const ABS_DATAFLOW    = Deno.env.get("ABS_DATAFLOW") || ""; // e.g. "ABS,EARNINGS,1.0.0"

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Normalise the SPL rating text into our shortage enum.
function mapShortage(rating: string): string | null {
  const r = (rating || "").toLowerCase();
  if (r.includes("no shortage")) return "none";
  if (r.includes("national")) return "national";
  if (r.includes("regional")) return "regional";
  if (r.includes("shortage")) return "national";
  return null;
}

// ── Skills Priority List → occupations.shortage (matched by ANZSCO) ──
async function syncSkillsPriorityList() {
  if (!SPL_RESOURCE_ID) return { source: "SkillsPriorityList", skipped: "SPL_RESOURCE_ID not set" };

  const url = `${CKAN}?resource_id=${encodeURIComponent(SPL_RESOURCE_ID)}&limit=10000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CKAN HTTP ${res.status}`);
  const json = await res.json();
  const records: Record<string, unknown>[] = json?.result?.records ?? [];

  const { data: occs } = await sb.from("occupations").select("id, anzsco");
  const byAnzsco = new Map((occs ?? []).map((o) => [String(o.anzsco), o.id as string]));

  let updated = 0;
  for (const rec of records) {
    // Column names differ between dataset versions — try the common ones.
    const code = String(
      rec.ANZSCO ?? rec.anzsco ?? rec["ANZSCO_Code"] ?? rec["ANZSCO Code"] ?? "",
    ).trim();
    const rating = String(
      rec.NationalRating ?? rec.Rating ?? rec.national_rating ?? rec["2024"] ?? rec["Rating 2024"] ?? "",
    );
    const id = byAnzsco.get(code);
    if (!id) continue;
    const shortage = mapShortage(rating);
    if (!shortage) continue;
    const { error } = await sb
      .from("occupations")
      .update({ shortage, source: "Jobs & Skills Australia — Skills Priority List (data.gov.au)", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) updated++;
  }
  return { source: "SkillsPriorityList", records: records.length, updated };
}

// ── ABS earnings → salaries (optional; needs an API key) ──
async function syncAbsSalaries() {
  if (!ABS_API_KEY || !ABS_DATAFLOW) return { source: "ABS", skipped: "ABS_API_KEY / ABS_DATAFLOW not set" };
  // Placeholder for the ABS SDMX call. The exact dataflow + dimension
  // mapping depends on the series you choose; wire it here once selected.
  // const res = await fetch(`https://api.data.abs.gov.au/data/${ABS_DATAFLOW}/...?format=jsondata`,
  //   { headers: { "x-api-key": ABS_API_KEY, accept: "application/vnd.sdmx.data+json" } });
  return { source: "ABS", skipped: "mapping not configured — see LIVE-DATA-SETUP.md" };
}

Deno.serve(async (req) => {
  // Shared-secret guard so the endpoint can't be triggered by randoms.
  const secret = Deno.env.get("SYNC_SECRET");
  if (secret && req.headers.get("x-sync-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const results = [];
    results.push(await syncSkillsPriorityList());
    results.push(await syncAbsSalaries());
    return new Response(
      JSON.stringify({ ok: true, ranAt: new Date().toISOString(), results }, null, 2),
      { headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
