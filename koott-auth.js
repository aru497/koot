/* ══════════════════════════════════════════════════════════
   Koott — shared auth layer (real Google sign-in via Supabase)
   Exposes window.koottAuth: { signIn, signOut, user, onChange, initials }
   Auto-renders into any element with id="koottNav".
══════════════════════════════════════════════════════════ */
(function () {
  const sb = window.sb;
  let currentUser = null;       // normalized profile or null
  let ready = false;            // first session check done
  const listeners = [];

  function normalize(u) {
    if (!u) return null;
    const m = u.user_metadata || {};
    return {
      id: u.id,
      email: u.email || "",
      name: m.full_name || m.name || (u.email || "user").split("@")[0],
      avatar: m.avatar_url || m.picture || null,
    };
  }

  function initials(name) {
    return (name || "?")
      .replace(/[^\p{L}\s]/gu, "")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  }

  async function signIn() {
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href.split("#")[0] },
    });
    if (error) alert("Sign-in error: " + error.message);
  }

  async function signOut() {
    await sb.auth.signOut();
  }

  function renderDefaultNav() {
    const el = document.getElementById("koottNav");
    if (!el) return;
    if (currentUser) {
      const inner = currentUser.avatar
        ? `<img src="${currentUser.avatar}" alt="" referrerpolicy="no-referrer">`
        : initials(currentUser.name);
      el.innerHTML =
        `<div style="display:flex;align-items:center;gap:.45rem;padding:.3rem .65rem .3rem .3rem;border:1.5px solid var(--bd);border-radius:100px;">` +
          `<div class="av">${inner}</div>` +
          `<span style="font-size:.8125rem;font-weight:600">${currentUser.name}</span>` +
        `</div>` +
        `<button class="btn btn-g" onclick="koottAuth.signOut()">Sign out</button>`;
    } else {
      el.innerHTML = `<button class="btn btn-p" onclick="koottAuth.signIn()">Sign in with Google</button>`;
    }
  }

  function setUser(u) {
    currentUser = normalize(u);
    ready = true;
    renderDefaultNav();
    listeners.forEach((cb) => { try { cb(currentUser); } catch (e) {} });
  }

  window.koottAuth = {
    signIn,
    signOut,
    initials,
    get user() { return currentUser; },
    get ready() { return ready; },
    onChange(cb) {
      listeners.push(cb);
      if (ready) { try { cb(currentUser); } catch (e) {} }
    },
  };

  sb.auth.getSession().then(({ data }) => setUser(data.session && data.session.user));
  sb.auth.onAuthStateChange((_event, session) => setUser(session && session.user));
})();
