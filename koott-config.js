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
