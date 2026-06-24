/* ══════════════════════════════════════════════════════════
   Koott — 1:1 consultation widget (self-contained)
   Injects a floating "Book a free 1:1 call" button + a dialog.
   Posts to the `book-consultation` Edge Function, which saves the
   request and emails the Koott team. Include AFTER koott-config.js
   (and koott-auth.js if you want the signed-in user attached):
     <script src="koott-consult.js"></script>
   Trigger it from any element with: onclick="koottConsult.open()"
══════════════════════════════════════════════════════════ */
(function () {
  function cfg() { return window.KOOTT_CONFIG || {}; }

  function injectCss() {
    if (document.getElementById('koottConsultCss')) return;
    var s = document.createElement('style');
    s.id = 'koottConsultCss';
    s.textContent =
      '.kc-fab{position:fixed;right:18px;bottom:18px;z-index:500;display:inline-flex;align-items:center;gap:.5rem;' +
        'padding:.7rem 1.05rem;border:3px solid var(--ink,#141414);border-radius:100px;background:var(--pri,#e8632a);' +
        'color:var(--ink,#141414);font-family:var(--font,Inter,sans-serif);font-weight:800;font-size:.9rem;cursor:pointer;' +
        'box-shadow:var(--sh-sm,3px 3px 0 #141414);transition:transform .08s,box-shadow .08s}' +
      '.kc-fab:hover{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--ink,#141414)}' +
      '@media(max-width:560px){.kc-fab span.kc-fab-tx{display:none}.kc-fab{padding:.7rem;font-size:1.1rem}}' +
      '#kcDlg{border:3px solid var(--ink,#141414);border-radius:16px;padding:0;box-shadow:var(--sh-lg,8px 8px 0 #141414);' +
        'max-width:460px;width:calc(100% - 2rem);color:var(--txt,#141414);background:var(--bg,#fff);margin:auto}' +
      '#kcDlg::backdrop{background:rgba(20,20,20,.45)}' +
      '.kc-in{padding:1.5rem}' +
      '.kc-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:.2rem}' +
      '.kc-ttl{font-size:1.15rem;font-weight:900;letter-spacing:-.02em}' +
      '.kc-sub{font-size:.85rem;color:var(--mut,#4a5568);margin-bottom:1rem;line-height:1.5}' +
      '.kc-lbl{display:block;font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;' +
        'font-family:var(--mono,monospace);color:var(--lt,#6b7280);margin:.6rem 0 .25rem}' +
      '.kc-f{width:100%;padding:.55rem .7rem;border:2px solid var(--ink,#141414);border-radius:6px;' +
        'font-family:var(--font,Inter,sans-serif);font-size:.9rem;background:var(--bg,#fff);color:var(--txt,#141414)}' +
      '.kc-f:focus{outline:none;box-shadow:var(--sh-sm,3px 3px 0 #141414)}' +
      'textarea.kc-f{resize:vertical;min-height:64px}' +
      '.kc-row{display:flex;gap:.6rem}.kc-row>div{flex:1}' +
      '.kc-msg{font-size:.82rem;margin-top:.6rem;font-weight:600}' +
      '.kc-x{border:2px solid var(--ink,#141414);background:var(--bg,#fff);border-radius:6px;cursor:pointer;' +
        'font-weight:800;padding:.15rem .5rem;font-family:var(--font,Inter,sans-serif)}';
    document.head.appendChild(s);
  }

  function buildDialog() {
    if (document.getElementById('kcDlg')) return;
    var d = document.createElement('dialog');
    d.id = 'kcDlg';
    d.innerHTML =
      '<form class="kc-in" id="kcForm" onsubmit="return koottConsult._submit(event)">' +
        '<div class="kc-hd"><div class="kc-ttl">📞 Book a free 1:1 call</div>' +
          '<button type="button" class="kc-x" onclick="koottConsult.close()">✕</button></div>' +
        '<div class="kc-sub">Tell us a little about your plans and we’ll reach out to help you 1:1 — choosing a course, universities, visa or funding. Free, no obligation.</div>' +
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
        '<label class="kc-lbl">What do you want to study?</label>' +
        '<input class="kc-f" id="kc_field" maxlength="200" placeholder="e.g. Nursing, IT, Business…">' +
        '<label class="kc-lbl">How can we help?</label>' +
        '<textarea class="kc-f" id="kc_msg" maxlength="4000" placeholder="Your question, timeline, anything you’re unsure about…"></textarea>' +
        '<label class="kc-lbl">Best time to reach you</label>' +
        '<input class="kc-f" id="kc_time" maxlength="120" placeholder="e.g. weekday evenings IST">' +
        '<div class="kc-msg" id="kc_status" style="display:none"></div>' +
        '<button class="btn btn-p" type="submit" id="kc_submit" style="width:100%;justify-content:center;margin-top:1rem">Request my free 1:1 →</button>' +
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
    b.setAttribute('aria-label', 'Book a free 1:1 call');
    b.innerHTML = '<span aria-hidden="true">📞</span><span class="kc-fab-tx">Free 1:1 call</span>';
    b.onclick = function () { window.koottConsult.open(); };
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
        source_page: location.pathname, user_id: u ? u.id : null,
        hp_url: val('kc_hp'),
      };
      if (!payload.name) { setStatus('Please enter your name.', 'err'); return false; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email || '')) { setStatus('Please enter a valid email.', 'err'); return false; }
      btn.disabled = true; var old = btn.textContent; btn.textContent = 'Sending…';
      setStatus('', '');
      fetch(c.SUPABASE_URL + '/functions/v1/book-consultation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: c.SUPABASE_KEY, authorization: 'Bearer ' + c.SUPABASE_KEY },
        body: JSON.stringify(payload),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j && res.j.ok) {
            document.getElementById('kcForm').reset();
            setStatus('✅ Thanks! We’ve got your request and will be in touch soon.', 'ok');
            btn.textContent = 'Sent ✓';
            setTimeout(function () { window.koottConsult.close(); btn.disabled = false; btn.textContent = old; }, 2200);
          } else {
            setStatus((res.j && res.j.error) || 'Something went wrong. Please try again.', 'err');
            btn.disabled = false; btn.textContent = old;
          }
        }).catch(function () {
          setStatus('Network error — please check your connection and try again.', 'err');
          btn.disabled = false; btn.textContent = old;
        });
      return false;
    },
  };
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { injectCss(); buildFab(); });
  } else { injectCss(); buildFab(); }
})();
