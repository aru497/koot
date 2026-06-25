/* Koott — 1:1 consultation widget (self-contained)
   Injects a floating "Talk to an expert" button + a dialog.
   Posts to the `book-consultation` Edge Function, which saves the
   request and emails the Koott team. Include AFTER koott-config.js
   (and koott-auth.js if you want the signed-in user attached):
     <script src="koott-consult.js"></script>
   Trigger it from any element with: onclick="koottConsult.open()"
*/
(function () {
  function cfg() { return window.KOOTT_CONFIG || {}; }

  function injectCss() {
    if (document.getElementById('koottConsultCss')) return;
    var s = document.createElement('style');
    s.id = 'koottConsultCss';
    s.textContent =
      '.kc-fab{position:fixed;right:20px;bottom:20px;z-index:500;display:inline-flex;align-items:center;gap:.65rem;' +
        'padding:.5rem .9rem .5rem .5rem;border:1px solid var(--bd,#ece7df);border-radius:100px;background:var(--card,#fffdfb);' +
        'color:var(--txt,#1a1714);font-family:var(--font,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif);cursor:pointer;white-space:nowrap;' +
        'box-shadow:var(--sh,0 2px 6px rgba(20,18,15,.05),0 16px 34px -16px rgba(20,18,15,.2));transition:transform .15s ease,box-shadow .15s ease}' +
      '.kc-fab:hover{transform:translateY(-2px);box-shadow:var(--sh-lg,0 4px 12px rgba(20,18,15,.05),0 18px 50px -12px rgba(13,13,15,.22))}' +
      '.kc-fav{width:38px;height:38px;border-radius:50%;background:var(--accent,#e8622c);border:0;box-shadow:0 0 0 3px var(--accent-bg,#fef2ec);' +
        'display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative}' +
      '.kc-fdot{position:absolute;top:-1px;right:-1px;width:10px;height:10px;background:#22c55e;border-radius:50%;' +
        'border:2px solid var(--card,#fff);animation:kcpulse 2s ease-in-out infinite}' +
      '@keyframes kcpulse{0%,100%{opacity:1}50%{opacity:.35}}' +
      '.kc-flbl{display:flex;flex-direction:column;align-items:flex-start}' +
      '.kc-fm{font-size:.875rem;font-weight:650;line-height:1.25;color:var(--txt,#1a1714)}' +
      '.kc-fs{font-size:.68rem;font-weight:500;color:var(--mut,#6f675d);line-height:1.25}' +
      '@media(max-width:480px){.kc-flbl{display:none}.kc-fab{padding:.5rem}}' +
      '#kcDlg{border:1px solid var(--bd,#ece7df);border-radius:var(--rx,16px);padding:0;box-shadow:var(--sh-lg,0 18px 50px -12px rgba(13,13,15,.22));' +
        'max-width:460px;width:calc(100% - 2rem);color:var(--txt,#1a1714);background:var(--card,#fffdfb);margin:auto}' +
      '#kcDlg::backdrop{background:rgba(20,18,15,.45);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}' +
      '.kc-in{padding:1.5rem}' +
      '.kc-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:.2rem}' +
      '.kc-ttl{font-size:1.2rem;font-weight:800;letter-spacing:-.02em;color:var(--txt,#1a1714)}' +
      '.kc-sub{font-size:.85rem;color:var(--mut,#6f675d);margin-bottom:1rem;line-height:1.5}' +
      '.kc-lbl{display:block;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;' +
        'font-family:var(--mono,ui-monospace,monospace);color:var(--lt,#9c948a);margin:.6rem 0 .25rem}' +
      '.kc-f{width:100%;padding:.6rem .8rem;border:1.5px solid var(--bd-hi,#ddd6ca);border-radius:var(--rl,12px);' +
        'font-family:var(--font,-apple-system,system-ui,sans-serif);font-size:.9rem;background:var(--bg,#fdfcfa);color:var(--txt,#1a1714);transition:border-color .15s,box-shadow .15s}' +
      '.kc-f:focus{outline:none;border-color:var(--accent,#e8622c);box-shadow:var(--ring,0 0 0 4px var(--accent-bg,#fef2ec))}' +
      'textarea.kc-f{resize:vertical;min-height:64px}' +
      '.kc-row{display:flex;gap:.6rem}.kc-row>div{flex:1}' +
      '.kc-wants{display:flex;flex-direction:column;gap:.45rem;margin:.3rem 0 .2rem}' +
      '.kc-want{display:flex;align-items:flex-start;gap:.55rem;font-size:.86rem;font-weight:550;' +
        'color:var(--txt,#1a1714);cursor:pointer;line-height:1.35}' +
      '.kc-want input{width:17px;height:17px;margin-top:1px;accent-color:var(--accent,#e8622c);cursor:pointer;flex-shrink:0}' +
      '.kc-msg{font-size:.82rem;margin-top:.6rem;font-weight:600}' +
      '.kc-x{border:1px solid var(--bd,#ece7df);background:var(--bg-sub,#f6f3ee);border-radius:50%;cursor:pointer;width:30px;height:30px;' +
        'display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--mut,#6f675d);font-family:var(--font,sans-serif);transition:border-color .15s,color .15s}' +
      '.kc-x:hover{border-color:var(--txt,#1a1714);color:var(--txt,#1a1714)}';
    document.head.appendChild(s);
  }

  function buildDialog() {
    if (document.getElementById('kcDlg')) return;
    var d = document.createElement('dialog');
    d.id = 'kcDlg';
    d.innerHTML =
      '<form class="kc-in" id="kcForm" onsubmit="return koottConsult._submit(event)">' +
        '<div class="kc-hd"><div class="kc-ttl">Talk to an expert</div>' +
          '<button type="button" class="kc-x" onclick="koottConsult.close()">&#10005;</button></div>' +
        '<div class="kc-sub">Our advisors have been through this journey. Get free, honest guidance on courses, universities, visa &amp; funding &mdash; no agents, no commission.</div>' +
        // Honeypot: hidden from humans; bots fill it and get silently dropped.
        '<input id="kc_hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" ' +
          'style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />' +
        '<div class="kc-row">' +
          '<div><label class="kc-lbl">Your name *</label><input class="kc-f" id="kc_name" required maxlength="120" autocomplete="name"></div>' +
          '<div><label class="kc-lbl">Email *</label><input class="kc-f" id="kc_email" type="email" required maxlength="200" autocomplete="email"></div>' +
        '</div>' +
        '<div class="kc-row">' +
          '<div><label class="kc-lbl">Phone / WhatsApp</label><input class="kc-f" id="kc_phone" maxlength="60" autocomplete="tel" inputmode="tel"></div>' +
          '<div><label class="kc-lbl">Study level</label><select class="kc-f" id="kc_level">' +
            '<option value="">Not sure yet</option><option>Undergraduate</option><option>Postgraduate / Masters</option><option>PhD / Research</option><option>Diploma / VET</option></select></div>' +
        '</div>' +
        '<label class="kc-lbl">What would you like?</label>' +
        '<div class="kc-wants">' +
          '<label class="kc-want"><input type="checkbox" id="kc_want_call" checked> A free 1:1 call with an advisor</label>' +
          '<label class="kc-want"><input type="checkbox" id="kc_want_kit"> A free arrival kit (bank, SIM, transport &amp; first-week checklist)</label>' +
        '</div>' +
        '<label class="kc-lbl">What do you want to study?</label>' +
        '<input class="kc-f" id="kc_field" maxlength="200" placeholder="e.g. Nursing, IT, Business...">' +
        '<label class="kc-lbl">How can we help?</label>' +
        '<textarea class="kc-f" id="kc_msg" maxlength="4000" placeholder="Your question, timeline, anything you are unsure about..."></textarea>' +
        '<label class="kc-lbl">Best time to reach you</label>' +
        '<input class="kc-f" id="kc_time" maxlength="120" placeholder="e.g. weekday evenings IST">' +
        '<div class="kc-msg" id="kc_status" style="display:none"></div>' +
        '<button class="btn btn-p" type="submit" id="kc_submit" style="width:100%;justify-content:center;margin-top:1rem">Book my free session &rarr;</button>' +
        '<p style="font-size:.7rem;color:var(--lt,#6b7280);text-align:center;margin-top:.6rem;font-family:var(--mono,monospace)">We only use this to contact you about your study plans.</p>' +
      '</form>';
    document.body.appendChild(d);
  }

  function buildFab() {
    if (document.getElementById('kcFab') || document.body.hasAttribute('data-kc-no-fab')) return;
    var b = document.createElement('button');
    b.id = 'kcFab';
    b.className = 'kc-fab';
    b.type = 'button';
    b.setAttribute('aria-label', 'Talk to an expert — free');
    b.innerHTML =
      '<div class="kc-fav">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '<span class="kc-fdot"></span>' +
      '</div>' +
      '<div class="kc-flbl">' +
        '<span class="kc-fm">Talk to an expert</span>' +
        '<span class="kc-fs">Book a free call</span>' +
      '</div>';
    b.onclick = function () { if (window.koottHaptic) window.koottHaptic('rigid'); window.koottConsult.open(); };
    document.body.appendChild(b);
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('kc_status');
    if (!el) return;
    el.style.display = msg ? 'block' : 'none';
    el.textContent = msg || '';
    el.style.color = kind === 'err' ? 'var(--red,#d62f2f)' : kind === 'ok' ? 'var(--grn,#15924b)' : 'var(--mut,#4a5568)';
  }

  window.koottConsult = {
    open: function (prefill) {
      injectCss(); buildDialog();
      setStatus('', '');
      var f = document.getElementById('kc_field');
      if (prefill && prefill.field && f && !f.value) f.value = prefill.field;
      try { document.getElementById('kcDlg').showModal(); } catch (e) {}
    },
    close: function () { try { document.getElementById('kcDlg').close(); } catch (e) {} },
    _submit: function (ev) {
      ev.preventDefault();
      var c = cfg();
      if (!c.SUPABASE_URL || !c.SUPABASE_KEY) { setStatus('Configuration error — please email us directly.', 'err'); return false; }
      var btn = document.getElementById('kc_submit');
      var u = (window.koottAuth && window.koottAuth.user) || null;
      var payload = {
        name: val('kc_name'), email: val('kc_email'), phone: val('kc_phone'),
        study_level: val('kc_level'), field_interest: val('kc_field'),
        message: val('kc_msg'), preferred_time: val('kc_time'),
        wants_call: checked('kc_want_call'), wants_arrival_kit: checked('kc_want_kit'),
        source_page: location.pathname, user_id: u ? u.id : null,
        hp_url: val('kc_hp'),
      };
      if (!payload.name) { setStatus('Please enter your name.', 'err'); return false; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email || '')) { setStatus('Please enter a valid email.', 'err'); return false; }
      btn.disabled = true; var old = btn.textContent; btn.textContent = 'Sending...';
      setStatus('', '');
      fetch(c.SUPABASE_URL + '/functions/v1/book-consultation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: c.SUPABASE_KEY, authorization: 'Bearer ' + c.SUPABASE_KEY },
        body: JSON.stringify(payload),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j && res.j.ok) {
            if (window.koottHaptic) window.koottHaptic('success');
            document.getElementById('kcForm').reset();
            setStatus('Thanks! We have got your request and will be in touch soon.', 'ok');
            btn.textContent = 'Sent';
            setTimeout(function () { window.koottConsult.close(); btn.disabled = false; btn.textContent = old; }, 2200);
          } else {
            if (window.koottHaptic) window.koottHaptic('error');
            setStatus((res.j && res.j.error) || 'Something went wrong. Please try again.', 'err');
            btn.disabled = false; btn.textContent = old;
          }
        }).catch(function () {
          if (window.koottHaptic) window.koottHaptic('error');
          setStatus('Network error — please check your connection and try again.', 'err');
          btn.disabled = false; btn.textContent = old;
        });
      return false;
    },
  };
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function checked(id) { var e = document.getElementById(id); return e ? !!e.checked : false; }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { injectCss(); buildFab(); });
  } else { injectCss(); buildFab(); }
})();
