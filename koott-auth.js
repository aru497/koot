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

  function injectMenuCss() {
    if (document.getElementById("koottAcctCss")) return;
    const s = document.createElement("style");
    s.id = "koottAcctCss";
    s.textContent =
      ".koott-acct{position:relative}" +
      ".koott-acct-btn{display:flex;align-items:center;gap:.45rem;padding:.3rem .55rem .3rem .3rem;border:1.5px solid var(--bd);border-radius:100px;background:var(--bg);cursor:pointer;font-family:var(--font);color:var(--txt)}" +
      ".koott-acct-btn:hover{border-color:var(--bd-hi)}" +
      ".koott-acct-btn .nm{font-size:.8125rem;font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".koott-acct-btn .cv{color:var(--lt);font-size:.7rem;transition:transform .15s}" +
      ".koott-acct.open .koott-acct-btn .cv{transform:rotate(180deg)}" +
      ".koott-acct-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:180px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--rl,10px);box-shadow:var(--sh-lg,0 12px 32px rgba(0,0,0,.14));padding:.35rem;z-index:600;display:none}" +
      ".koott-acct.open .koott-acct-menu{display:block}" +
      ".koott-acct-menu .mi{display:flex;align-items:center;gap:.5rem;width:100%;text-align:left;padding:.55rem .7rem;border:none;background:none;border-radius:8px;font-size:.85rem;font-weight:550;color:var(--txt);cursor:pointer;font-family:var(--font)}" +
      ".koott-acct-menu .mi:hover{background:var(--bg-sub)}" +
      ".koott-acct-menu .mhdr{padding:.5rem .7rem;border-bottom:1px solid var(--bd);margin-bottom:.25rem}" +
      ".koott-acct-menu .mhdr .e{font-size:.72rem;color:var(--lt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}";
    document.head.appendChild(s);
  }
  function esc(t){ return String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function renderDefaultNav() {
    const el = document.getElementById("koottNav");
    if (!el) return;
    if (currentUser) {
      injectMenuCss();
      const inner = currentUser.avatar
        ? `<img src="${esc(currentUser.avatar)}" alt="" referrerpolicy="no-referrer">`
        : initials(currentUser.name);
      el.innerHTML =
        `<div class="koott-acct" id="koottAcct">` +
          `<button class="koott-acct-btn" onclick="koottAuth.toggleMenu(event)" aria-haspopup="true">` +
            `<div class="av">${inner}</div>` +
            `<span class="nm">${esc(currentUser.name)}</span>` +
            `<span class="cv">▾</span>` +
          `</button>` +
          `<div class="koott-acct-menu">` +
            `<div class="mhdr"><div style="font-size:.8rem;font-weight:700">${esc(currentUser.name)}</div><div class="e">${esc(currentUser.email)}</div></div>` +
            `<button class="mi" onclick="koottAuth.signOut()">↩&nbsp; Sign out</button>` +
          `</div>` +
        `</div>`;
    } else {
      el.innerHTML = `<button class="btn btn-p" onclick="koottAuth.signIn()">Sign in with Google</button>`;
    }
  }
  function toggleMenu(e){
    if (e) e.stopPropagation();
    const a = document.getElementById("koottAcct");
    if (a) a.classList.toggle("open");
  }
  document.addEventListener("click", function(e){
    const a = document.getElementById("koottAcct");
    if (a && a.classList.contains("open") && !a.contains(e.target)) a.classList.remove("open");
  });

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
    toggleMenu,
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
