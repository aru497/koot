/* Koott — student profile + interest matching (Phase 1)
   Persists a signed-in student's profile to Supabase (RLS: own row only) and
   maps it to the Sabha community rooms relevant to them.
   Include AFTER koott-config.js and koott-auth.js:
     <script src="koott-profile.js"></script>
*/
(function () {
  function sb() { return window.sb; }
  function user() { return (window.koottAuth && window.koottAuth.user) || null; }

  // Advisor FIELD_CIRCLES category id -> field-circle community id (Sabha room key).
  var FIELD_CIRCLE = {
    IT: 'field-it', Healthcare: 'field-health', Engineering: 'field-eng',
    Business: 'field-biz', Education: 'field-edu', SocialWork: 'field-social',
    Creative: 'field-creative', Science: 'field-science', Agriculture: 'field-agri',
    Hospitality: 'field-hosp',
  };

  // Only these columns are ever written; missing/blank values are left out so the
  // table keeps NULLs rather than fake blanks (project rule: no made-up data).
  var FIELDS = ['field', 'field_label', 'field_text', 'study_level',
    'destination_city', 'destination_uni', 'intake', 'stage', 'location_pref'];

  function clean(d) {
    var out = {}; d = d || {};
    FIELDS.forEach(function (k) { if (d[k] != null && d[k] !== '') out[k] = d[k]; });
    if (Array.isArray(d.interests)) out.interests = d.interests;
    if (typeof d.discoverable === 'boolean') out.discoverable = d.discoverable;
    if (typeof d.allow_dms === 'boolean') out.allow_dms = d.allow_dms;
    return out;
  }

  window.koottProfile = {
    // Upsert the signed-in user's profile. Only provided keys are written.
    // Stored in `student_profiles` (own-row RLS), keyed on the auth user id.
    save: function (data) {
      var u = user();
      if (!u || !sb()) return Promise.resolve({ error: { message: 'not signed in' } });
      var row = Object.assign({ id: u.id }, clean(data));
      if (data && data.discoverable === true) row.consent_at = new Date().toISOString();
      return sb().from('student_profiles').upsert(row, { onConflict: 'id' });
    },

    // Fetch the signed-in user's own profile (or null).
    get: function () {
      var u = user();
      if (!u || !sb()) return Promise.resolve(null);
      return sb().from('student_profiles').select('*').eq('id', u.id).maybeSingle()
        .then(function (r) { return (r && r.data) || null; });
    },

    // Opt in/out of being discoverable by (and messageable from) other students.
    setDiscoverable: function (on) {
      return this.save({ discoverable: !!on, allow_dms: !!on });
    },

    // The Sabha rooms relevant to a profile: the field circle plus any known
    // city / uni / stage rooms. Returns [{id, roomId, url}]. (Everyone currently
    // auto-joins every room, so this is used to deep-link a student into *theirs*.)
    relevantRooms: function (profile) {
      profile = profile || {};
      var cfg = window.KOOTT_CONFIG || {}, rooms = cfg.SABHA_ROOMS || {}, host = cfg.SABHA_HOST || '';
      var ids = [];
      var f = profile.field;
      var fc = FIELD_CIRCLE[f] || (String(f || '').indexOf('field-') === 0 ? f : null);
      if (fc) ids.push(fc);
      [profile.destination_city, profile.destination_uni, profile.stage].forEach(function (k) {
        if (k && rooms[k]) ids.push(k);
      });
      var seen = {};
      return ids.filter(function (id) { if (seen[id] || !rooms[id]) return false; seen[id] = 1; return true; })
        .map(function (id) {
          return {
            id: id,
            roomId: rooms[id],
            url: host ? host + '/rooms/' + encodeURIComponent(rooms[id])
              : 'communities.html?c=' + encodeURIComponent(id),
          };
        });
    },

    // Convenience: the field-circle community id for an advisor category.
    fieldCircleId: function (cat) { return FIELD_CIRCLE[cat] || null; },

    // ── Phase 2: find students like you ──
    // Scores every opted-in peer (from the consent-gated discoverable_peers RPC)
    // against `me` by weighted attribute overlap and returns the top matches.
    // Any shared dimension contributes, so "same field" OR "same city" both match.
    matchPeers: function (me, limit) {
      var self = this;
      if (!sb() || !user()) return Promise.resolve([]);
      var ready = me ? Promise.resolve(me) : self.get();
      return ready.then(function (myp) {
        myp = myp || {};
        return sb().rpc('discoverable_peers').then(function (r) {
          if (!r || r.error || !Array.isArray(r.data)) return [];
          var W = { field: 10, destination_uni: 8, destination_city: 5, intake: 4, stage: 3 };
          var LABEL = { field: 'same field', destination_uni: 'same university',
            destination_city: 'same city', intake: 'same intake', stage: 'same stage' };
          var mine = myp.interests || [];
          return r.data.map(function (p) {
            var score = 0, reasons = [];
            Object.keys(W).forEach(function (k) {
              if (myp[k] && p[k] && myp[k] === p[k]) { score += W[k]; reasons.push(LABEL[k]); }
            });
            var pi = p.interests || [];
            var shared = mine.filter(function (x) { return pi.indexOf(x) >= 0; }).length;
            if (shared) { score += shared; reasons.push(shared + ' shared interest' + (shared > 1 ? 's' : '')); }
            return { id: p.id, name: p.full_name, avatar: p.avatar_url, field: p.field,
              field_label: p.field_label, city: p.destination_city, uni: p.destination_uni,
              stage: p.stage, allow_dms: p.allow_dms, score: score, reasons: reasons };
          }).filter(function (p) { return p.score > 0; })
            .sort(function (a, b) { return b.score - a.score; })
            .slice(0, limit || 6);
        });
      }).catch(function () { return []; });
    },
  };
})();
