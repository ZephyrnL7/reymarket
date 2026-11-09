/* PIN KEAMANAN — khusus APLIKASI (APK/PWA). Di website file ini tidak melakukan apa-apa.
   1) Kunci aplikasi: layar PIN tampil LANGSUNG saat aplikasi dibuka (sebelum beranda sempat tergambar),
      dan saat kembali dari latar belakang setelah melewati jeda yang dipilih user.
   2) Penutup privasi: begitu aplikasi ke latar belakang, isi layar langsung ditutup (tidak bocor di daftar aplikasi terbaru).
   3) PIN transaksi: kalau PIN aktif, SEMUA pembelian / transfer / penarikan meminta PIN dulu.
      Server menerbitkan "tiket" sekali pakai (90 detik) setelah PIN benar; tiket dikirim lewat header X-RM-Pin-Ticket.
      Server tetap memeriksa sendiri (lihat rmBuyGate di index.js), jadi melewati layar ini tidak berguna.
   Muat file ini di <head>, SESUDAH app-detect.js. */
(function () {
  if (window.RMPin) return;
  var IS_APP = !!window.RM_IS_APP;
  var LS = window.localStorage, SS = window.sessionStorage;
  function lget(k) { try { return LS.getItem(k) || ''; } catch (e) { return ''; } }
  function lset(k, v) { try { LS.setItem(k, v); } catch (e) {} }
  function sget(k) { try { return SS.getItem(k) || ''; } catch (e) { return ''; } }
  function sset(k, v) { try { SS.setItem(k, v); } catch (e) {} }
  function token() { return lget('token'); }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  var root = document.documentElement;
  function host() { return document.body && document.body.parentNode === root ? document.body.parentNode : root; }

  // ---------- gaya ----------
  var css = document.createElement('style');
  css.textContent =
    'html.rm-locked>body{visibility:hidden!important}' +
    '.rmpin,.rmpin-cover{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483100;background:#0f2557;color:#fff;box-sizing:border-box;font-family:system-ui,-apple-system,Roboto,sans-serif;contain:layout paint style;}' +
    '.rmpin-cover{z-index:2147483300;display:flex;align-items:center;justify-content:center;background:#0f2557;}' +
    '.rmpin-cover img{width:72px;height:72px;border-radius:20px;object-fit:cover;}' +
    '.rmpin{display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:calc(36px + env(safe-area-inset-top,0px)) 20px calc(24px + env(safe-area-inset-bottom,0px));touch-action:manipulation;user-select:none;-webkit-user-select:none;background:#0f2557;overflow:hidden;}' +
    '.rmpin-head{display:flex;flex-direction:column;align-items:center;width:100%;}' +
    '.rmpin-x{position:absolute;left:12px;top:calc(12px + env(safe-area-inset-top,0px));width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:16px;cursor:pointer;}' +
    '.rmpin-logo{width:60px;height:60px;border-radius:18px;object-fit:cover;margin-bottom:16px;}' +
    '.rmpin-t{font-size:20px;font-weight:800;margin-bottom:6px;text-align:center;letter-spacing:.2px;}' +
    '.rmpin-s{font-size:13px;color:rgba(255,255,255,.72);min-height:36px;text-align:center;line-height:1.45;max-width:300px;}' +
    '.rmpin-s.err{color:#fca5a5;font-weight:700;}' +
    '.rmpin-dots{display:flex;gap:16px;margin:10px 0 0;}' +
    '.rmpin-dots i{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.55);display:block;}' +
    '.rmpin-dots i.on{background:#fff;border-color:#fff;}' +
    '.rmpin-dots.shake{animation:rmpinShake .32s;}' +
    '@keyframes rmpinShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-9px)}50%{transform:translateX(9px)}75%{transform:translateX(-5px)}}' +
    '.rmpin-mid{flex:1;display:flex;align-items:center;justify-content:center;width:100%;}' +
    '.rmpin-pad{display:grid;grid-template-columns:repeat(3,minmax(0,78px));gap:clamp(10px,2.4vh,18px) 24px;justify-content:center;}' +
    '.rmpin-k{width:100%;aspect-ratio:1/1;max-height:78px;border:0;border-radius:50%;background:rgba(255,255,255,.09);color:#fff;font-size:27px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;-webkit-tap-highlight-color:transparent;}' +
    '.rmpin-k:active{background:rgba(255,255,255,.26);}' +
    '.rmpin-k.ghost{background:transparent;font-size:22px;}' +
    '.rmpin-foot{min-height:44px;display:flex;align-items:center;}' +
    '.rmpin-link{background:none;border:0;color:#93c5fd;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;padding:10px 14px;}' +
    '.rmpin-form{width:100%;max-width:320px;margin:auto;}' +
    '.rmpin-form input{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff;font-size:16px;outline:0;margin:8px 0 10px;font-family:inherit;}' +
    '.rmpin-form button{width:100%;padding:14px;border:0;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;margin-top:6px;}' +
    '@media (max-height:620px){.rmpin-logo{display:none}.rmpin-k{max-height:60px;font-size:23px}}';
  (document.head || root).appendChild(css);

  // ---------- komponen keypad ----------
  // opts: { title, sub, cancel(bool), onComplete(pin, ui), onCancel(), footer: [{text, onClick}] }
  function buildPad(opts) {
    var el = document.createElement('div');
    el.className = 'rmpin';
    var html = '';
    if (opts.cancel) html += '<button class="rmpin-x" type="button" aria-label="Batal">&#10005;</button>';
    html += '<div class="rmpin-head"><img class="rmpin-logo" src="/images/Riki.png" alt="" onerror="this.style.display=\'none\'">' +
      '<div class="rmpin-t"></div><div class="rmpin-s"></div>' +
      '<div class="rmpin-dots"><i></i><i></i><i></i><i></i><i></i><i></i></div></div>' +
      '<div class="rmpin-mid"><div class="rmpin-pad">';
    for (var n = 1; n <= 9; n++) html += '<button class="rmpin-k" type="button" data-k="' + n + '">' + n + '</button>';
    html += '<span></span><button class="rmpin-k" type="button" data-k="0">0</button><button class="rmpin-k ghost" type="button" data-k="del" aria-label="Hapus">&#9003;</button></div></div>' +
      '<div class="rmpin-foot"></div>';
    el.innerHTML = html;
    var tEl = el.querySelector('.rmpin-t'), sEl = el.querySelector('.rmpin-s'), dots = el.querySelector('.rmpin-dots'), buf = '', busy = false, tick = null;
    tEl.textContent = opts.title || 'Masukkan PIN';
    sEl.textContent = opts.sub || '';
    function paint() { var d = dots.querySelectorAll('i'); for (var i = 0; i < d.length; i++) d[i].className = i < buf.length ? 'on' : ''; }
    var ui = {
      el: el,
      setSub: function (txt, err) { sEl.textContent = txt || ''; sEl.className = 'rmpin-s' + (err ? ' err' : ''); },
      clear: function () { buf = ''; paint(); },
      busy: function (b) { busy = !!b; },
      shake: function (msg) { ui.setSub(msg, true); dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); try { navigator.vibrate && navigator.vibrate(120); } catch (e) {} buf = ''; setTimeout(paint, 220); },
      countdown: function (secs) {
        if (tick) clearInterval(tick);
        ui.busy(true); buf = ''; paint();
        var left = secs;
        function say() { ui.setSub('Terkunci sementara. Coba lagi dalam ' + (left >= 60 ? Math.ceil(left / 60) + ' menit' : left + ' detik') + '.', true); }
        say();
        tick = setInterval(function () { left--; if (left <= 0) { clearInterval(tick); tick = null; ui.busy(false); ui.setSub('Masukkan PIN kamu', false); } else say(); }, 1000);
      },
      close: function () { if (tick) { clearInterval(tick); tick = null; } document.removeEventListener('keydown', onKey, true); if (el.parentNode) el.parentNode.removeChild(el); }
    };
    function press(k) {
      if (busy) return;
      if (k === 'del') { buf = buf.slice(0, -1); paint(); return; }
      if (buf.length >= 6) return;
      buf += k; paint(); sEl.className = 'rmpin-s';
      if (buf.length === 6) { var v = buf; opts.onComplete && opts.onComplete(v, ui); }
    }
    function onKey(e) {
      if (/^\d$/.test(e.key)) { press(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('del'); e.preventDefault(); }
    }
    function tap(e) { var b = e.target.closest && e.target.closest('[data-k]'); if (b) press(b.getAttribute('data-k')); }
    if (window.PointerEvent) {
      el.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && e.button !== 0) return; tap(e); });
      el.addEventListener('click', function (e) { if (e.detail === 0) tap(e); }); // keyboard / aksesibilitas
    } else el.addEventListener('click', tap);
    var x = el.querySelector('.rmpin-x');
    if (x) x.addEventListener('click', function () { ui.close(); opts.onCancel && opts.onCancel(); });
    var foot = el.querySelector('.rmpin-foot');
    (opts.footer || []).forEach(function (f) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'rmpin-link'; b.textContent = f.text;
      b.addEventListener('click', function () { f.onClick(ui); });
      foot.appendChild(b);
    });
    document.addEventListener('keydown', onKey, true);
    host().appendChild(el);
    return ui;
  }

  // Minta PIN sekali (dipakai menu Akun: pasang / ubah / matikan). resolve(pin) atau resolve(null) kalau dibatalkan.
  function prompt(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var done = false;
      buildPad({
        title: o.title || 'Masukkan PIN', sub: o.sub || '', cancel: o.cancel !== false,
        onComplete: function (pin, ui) { done = true; ui.close(); resolve(pin); },
        onCancel: function () { if (!done) resolve(null); }
      });
    });
  }

  // ---------- layar kunci ----------
  var lockUI = null, cover = null;
  function delaySec() { var v = lget('rm_pin_delay'); return v === '' ? 30 : Math.max(0, parseInt(v, 10) || 0); }
  function setCover(on) {
    if (on && !cover) {
      cover = document.createElement('div'); cover.className = 'rmpin-cover';
      cover.innerHTML = '<img src="/images/Riki.png" alt="" onerror="this.style.display=\'none\'">';
      host().appendChild(cover);
    } else if (!on && cover) { if (cover.parentNode) cover.parentNode.removeChild(cover); cover = null; }
  }
  function unlock() {
    sset('rm_pin_ok', String(Date.now()));
    root.classList.remove('rm-locked');
    if (lockUI) { lockUI.close(); lockUI = null; }
    setCover(false);
  }
  function showForgot() {
    var f = document.createElement('div');
    f.className = 'rmpin';
    f.style.zIndex = '2147483250';
    f.innerHTML = '<div class="rmpin-form"><div class="rmpin-t" style="margin-bottom:6px;">Lupa PIN?</div>' +
      '<div class="rmpin-s" style="margin:0 auto 6px;">Masukkan password akun untuk mematikan PIN. Setelah itu kamu bisa memasang PIN baru di menu Akun.</div>' +
      '<input type="password" placeholder="Password akun" autocomplete="current-password">' +
      '<div class="rmpin-s err" id="rmpinFErr" style="min-height:20px;"></div>' +
      '<button type="button" style="background:#fff;color:#16306b;" id="rmpinFOk">Matikan PIN</button>' +
      '<button type="button" style="background:rgba(255,255,255,.12);color:#fff;" id="rmpinFNo">Batal</button></div>';
    host().appendChild(f);
    var inp = f.querySelector('input'), err = f.querySelector('#rmpinFErr');
    f.querySelector('#rmpinFNo').onclick = function () { f.parentNode.removeChild(f); };
    f.querySelector('#rmpinFOk').onclick = function () {
      if (!inp.value) { err.textContent = 'Isi password dulu.'; return; }
      err.textContent = 'Memeriksa...';
      post('/api/pin/disable', { token: token(), password: inp.value }).then(function (r) {
        if (r.success) { lset('rm_pin_on', '0'); f.parentNode.removeChild(f); unlock(); }
        else err.textContent = r.message || 'Gagal.';
      }).catch(function () { err.textContent = 'Gagal terhubung ke server.'; });
    };
  }
  function showLock() {
    if (lockUI || !token()) return;
    root.classList.add('rm-locked');
    setCover(false);
    lockUI = buildPad({
      title: 'Masukkan PIN', sub: 'Untuk membuka Riki Market', cancel: false,
      onComplete: function (pin, ui) {
        ui.busy(true);
        post('/api/pin/verify', { token: token(), pin: pin }).then(function (r) {
          if (r.success) { if (r.enabled === false) lset('rm_pin_on', '0'); unlock(); return; }
          if (r.locked_seconds) { ui.shake(''); ui.countdown(r.locked_seconds); }
          else { ui.busy(false); ui.shake(r.message || 'PIN salah.'); }
        }).catch(function () { ui.busy(false); ui.shake('Gagal terhubung ke server.'); });
      },
      footer: [{ text: 'Lupa PIN?', onClick: showForgot }]
    });
    lockUI.el.style.zIndex = '2147483200';
  }
  function lockNow() { sset('rm_pin_ok', ''); if (IS_APP && lget('rm_pin_on') === '1') showLock(); }

  function syncStatus() {
    if (!IS_APP || !token()) return Promise.resolve();
    return post('/api/pin/status', { token: token() }).then(function (r) {
      if (!r || !r.success) return;
      lset('rm_pin_on', r.enabled ? '1' : '0');
      if (!r.enabled) { if (lockUI) unlock(); return; }
      if (!sget('rm_pin_ok')) { showLock(); if (r.locked_seconds && lockUI) lockUI.countdown(r.locked_seconds); }
    }).catch(function () {});
  }

  // ---------- PIN untuk transaksi ----------
  var BUY_RE = /^\/api\/(buy-[a-z0-9-]+(\/[a-z0-9-]+)?|stock-games\/order|extend-panel|nokos\/order|nokos\/reactivate|nokos2\/order|gacha|thr\/create|process-transfer|qris-statis\/withdraw)\/?$/;
  function isBuyUrl(u) {
    try { return BUY_RE.test(new URL(u, location.origin).pathname.toLowerCase()); } catch (e) { return false; }
  }
  var queue = Promise.resolve();
  // resolve: string tiket | 'none' (PIN ternyata sudah nonaktif) | null (dibatalkan)
  function askTicket(why) {
    var run = function () {
      return new Promise(function (resolve) {
        var done = false;
        buildPad({
          title: 'Konfirmasi dengan PIN', sub: why || 'Masukkan PIN untuk melanjutkan transaksi', cancel: true,
          onComplete: function (pin, ui) {
            ui.busy(true);
            post('/api/pin/verify', { token: token(), pin: pin, purpose: 'buy' }).then(function (r) {
              if (r.success && r.ticket) { done = true; ui.close(); resolve(r.ticket); return; }
              if (r.success && r.enabled === false) { done = true; lset('rm_pin_on', '0'); ui.close(); resolve('none'); return; }
              if (r.locked_seconds) { ui.shake(''); ui.countdown(r.locked_seconds); }
              else { ui.busy(false); ui.shake(r.message || 'PIN salah.'); }
            }).catch(function () { ui.busy(false); ui.shake('Gagal terhubung ke server.'); });
          },
          onCancel: function () { if (!done) resolve(null); }
        }).el.style.zIndex = '2147483250';
      });
    };
    var p = queue.then(run, run);
    queue = p.catch(function () {});
    return p;
  }
  function cancelledResponse() {
    return new Response(JSON.stringify({ success: false, pin_cancelled: true, message: 'Transaksi dibatalkan. PIN diperlukan untuk melanjutkan.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (window.fetch && !window.__rmPinFetch) {
    window.__rmPinFetch = true;
    var baseFetch = window.fetch.bind(window);
    var withTicket = function (input, init, ticket) {
      init = Object.assign({}, init || {});
      var h = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || {});
      if (ticket && ticket !== 'none') h.set('X-RM-Pin-Ticket', ticket);
      init.headers = h;
      return init;
    };
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = String((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
      if (method !== 'POST' || !isBuyUrl(url)) return baseFetch(input, init);
      var first = lget('rm_pin_on') === '1' ? askTicket() : Promise.resolve('none');
      return first.then(function (t) {
        if (t === null) return cancelledResponse();
        return baseFetch(input, withTicket(input, init, t)).then(function (res) {
          if (res.status !== 403) return res;
          // PIN ternyata aktif (mis. dipasang dari perangkat lain) -> minta PIN lalu ulangi sekali
          return res.clone().json().then(function (j) {
            if (!j || !j.pin_required) return res;
            lset('rm_pin_on', '1');
            return askTicket().then(function (t2) {
              if (t2 === null) return cancelledResponse();
              return baseFetch(input, withTicket(input, init, t2));
            });
          }).catch(function () { return res; });
        });
      });
    };
  }

  window.RMPin = {
    prompt: prompt, lockNow: lockNow, sync: syncStatus, confirm: askTicket,
    setEnabledHint: function (on) { lset('rm_pin_on', on ? '1' : '0'); if (on) sset('rm_pin_ok', String(Date.now())); },
    getDelay: delaySec, setDelay: function (s) { lset('rm_pin_delay', String(s)); }
  };

  // ---------- jalan otomatis (hanya APK) ----------
  if (!IS_APP) return;
  if (token()) {
    // langsung kunci sebelum halaman sempat tergambar; dicocokkan dengan server sesudahnya
    if (lget('rm_pin_on') === '1' && !sget('rm_pin_ok')) showLock();
    syncStatus();
  }
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (!token() || lget('rm_pin_on') !== '1') return;
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); sset('rm_pin_hidden', String(hiddenAt)); if (!lockUI) setCover(true); return; }
    var at = hiddenAt || parseInt(sget('rm_pin_hidden') || '0', 10);
    if (at && Date.now() - at >= delaySec() * 1000) { sset('rm_pin_ok', ''); showLock(); }
    setCover(false);
  });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && token() && lget('rm_pin_on') === '1' && !sget('rm_pin_ok')) showLock();
  });
})();
