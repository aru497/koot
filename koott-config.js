/* ══════════════════════════════════════════════════════════
   Koott — Supabase configuration
   This is the ONLY place your project details live.
   The publishable key is safe to ship in the browser (RLS
   protects your data). Never put a `sb_secret_…` key here.
══════════════════════════════════════════════════════════ */
window.KOOTT_CONFIG = {
  SUPABASE_URL: "https://pahgngtyfeletfpbavhf.supabase.co",
  SUPABASE_KEY: "sb_publishable_lEcUmg-6b0tOdFe2c2JaCA_IzqzOBlb",

  // (Optional) Not required — the Arrival map uses free OpenStreetMap/Leaflet,
  // no API key or billing needed. Left here only for future use.
  GOOGLE_MAPS_KEY: "",

  // Sabha chat integration — set to your Sabha instance URL after deployment.
  // Leave blank to keep using Koott's built-in chat for all communities.
  SABHA_HOST: "https://chat.koott.live",

  // Sabha rooms are identified by integer id (there are NO slugs), so we map
  // each Koott community id -> its Sabha room id. Fill this in by running
  // create-sabha-rooms.py after you create a bot in Sabha (see SABHA-SETUP.md).
  // Any community NOT in this map falls back to opening the Sabha home page.
  // The field-* keys are the Course Advisor's interest circles (advisor.html
  // FIELD_CIRCLES) -> their Sabha rooms (created 2026-06-25, ids 20-29).
  SABHA_ROOMS: {"sydney":2,"melb":3,"brisbane":4,"perth":5,"adelaide":6,"newcastle":7,"wollongong":8,"unsw25":9,"unimelb25":10,"monash25":11,"uon25":12,"uow25":13,"deciding":14,"applied":15,"arriving":16,"first60":17,"housing":18,"jobs":19,"field-it":20,"field-health":21,"field-eng":22,"field-biz":23,"field-edu":24,"field-social":25,"field-creative":26,"field-science":27,"field-agri":28,"field-hosp":29},
};

// Create the shared client (requires supabase-js UMD loaded first).
window.sb = window.supabase.createClient(
  window.KOOTT_CONFIG.SUPABASE_URL,
  window.KOOTT_CONFIG.SUPABASE_KEY,
  {
    auth: {
      flowType: "implicit",      // static-site friendly: tokens come back in URL hash
      detectSessionInUrl: true,  // pick up the session after Google redirect
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
