/* Deteksi APK/PWA + nama perangkat (Client Hints), dikirim ke server lewat header
   X-RM-App dan X-RM-Device pada semua request ke situs ini. */
(function () {
  try {
    var isApp = false;
    try { isApp = sessionStorage.getItem('rm_is_app') === '1'; } catch (e) {}
    if (!isApp) {
      var ref = document.referrer || '';
      var mq = function (q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
      if (ref.indexOf('android-app://') === 0 ||
          mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') ||
          mq('(display-mode: minimal-ui)') || window.navigator.standalone === true) {
        isApp = true;
        try { sessionStorage.setItem('rm_is_app', '1'); } catch (e) {}
      }
    }
    window.RM_IS_APP = isApp;
    // penanda untuk CSS: di dalam APK/PWA, fitur "Download APK" disembunyikan
    if (isApp) document.documentElement.classList.add('rm-app');

    // Nama perangkat: Chrome Android menyembunyikan model di User-Agent, tapi bisa diminta lewat Client Hints
    var deviceHeader = '';
    try { deviceHeader = localStorage.getItem('rm_device') || ''; } catch (e) {}
    var ready = Promise.resolve();
    var uad = navigator.userAgentData;
    if (uad && uad.getHighEntropyValues) {
      ready = uad.getHighEntropyValues(['model', 'platform', 'platformVersion']).then(function (v) {
        var os = v.platform || '';
        if (os === 'Android' && v.platformVersion) os += ' ' + String(v.platformVersion).split('.')[0];
        else if (os === 'Windows' && v.platformVersion) os = parseInt(v.platformVersion, 10) >= 13 ? 'Windows 11' : 'Windows 10';
        var model = (v.model || '').trim();
        if (!model && os.indexOf('Windows') === 0) model = 'PC Windows';
        if (!model && os === 'macOS') model = 'Mac';
        deviceHeader = encodeURIComponent(model + '|' + os);
        try { localStorage.setItem('rm_device', deviceHeader); } catch (e) {}
      }).catch(function () {});
    }

    if (!window.fetch || window.__rmFetchWrapped) return;
    window.__rmFetchWrapped = true;
    var origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var sameOrigin = url.charAt(0) === '/' || url.indexOf(location.origin) === 0;
      if (!sameOrigin) return origFetch(input, init);
      // hanya tunggu Client Hints untuk request pertama (maks 800 ms), sesudahnya langsung jalan
      var wait = deviceHeader ? Promise.resolve() : Promise.race([ready, new Promise(function (r) { setTimeout(r, 200); })]);
      return wait.then(function () {
        try {
          init = init || {};
          var h = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || {});
          if (isApp) h.set('X-RM-App', '1');
          if (deviceHeader) h.set('X-RM-Device', deviceHeader);
          init.headers = h;
        } catch (e) {}
        return origFetch(input, init);
      });
    };
  } catch (e) {}
})();


/* ===== LAYOUT ADAPTIF SESUAI LEBAR LAYAR ASLI =====
   Menghitung lebar "efektif" layar berdasarkan ukuran fisik perangkat, bukan lebar viewport mentah
   (yang bisa menyesatkan, mis. zoom browser 25% atau "Situs desktop" membuat viewport 2000-3000px).
   - Layar sentuh yang viewport-nya jauh lebih lebar dari ukuran fisiknya diperbesar secukupnya.
   - html[data-rm] = sm (<700) | md (700-1099) | lg (>=1100): dipakai CSS untuk jumlah kolom grid. */
(function () {
  var root = document.documentElement;
  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  function apply() {
    try {
      var w = window.innerWidth || root.clientWidth || 0;
      var dpr = window.devicePixelRatio || 1;
      var touch = mq('(pointer: coarse)') || (mq('(any-pointer: coarse)') && !mq('(pointer: fine)'));
      var z = 1;
      if (touch) {
        var phys = w * dpr;                                   // lebar fisik layar (piksel)
        var target = Math.max(360, Math.min(1400, phys / 2.6)); // lebar layout ideal (~ dp perangkat)
        if (w > target * 1.5) z = Math.min(6, w / target); // zoom hanya untuk mode "Situs desktop"; tablet/HP normal ikut ukuran asli
      }
      if (z > 1.02) {
        root.style.zoom = String(z);
        root.style.setProperty('--rm-zoom', String(z));
        root.classList.add('rm-zoomed');
      } else {
        z = 1;
        root.style.zoom = '';
        root.style.removeProperty('--rm-zoom');
        root.classList.remove('rm-zoomed');
      }
      var eff = w / z;
      root.setAttribute('data-rm', eff >= 1100 ? 'lg' : (eff >= 700 ? 'md' : 'sm'));
    } catch (e) {}
  }
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', function () { setTimeout(apply, 250); });
})();


/* ===== TINGGI FOOTER AKTIF (tanpa ruang kosong di bawah halaman produk) =====
   Footer "Total Pembayaran" bersifat fixed. Supaya konten berhenti PAS di atas footer
   (bukan memakai padding tebakan), tinggi footer asli diukur dan dipakai CSS lewat --rm-footer-h. */
(function () {
  var root = document.documentElement;
  var ro = null, watched = null, queued = false;
  function sync() {
    queued = false;
    try {
      var f = document.querySelector('.page-section.active > .sticky-footer');
      if (f !== watched) {
        if (ro && watched) ro.unobserve(watched);
        watched = f;
        if (ro && f) ro.observe(f);
      }
      var h = f ? Math.ceil(f.getBoundingClientRect().height / (parseFloat(root.style.zoom) || 1)) : 0;
      if (f && h > 0) {
        root.style.setProperty('--rm-footer-h', h + 'px');
        root.classList.add('rm-has-footer');
      } else {
        root.style.removeProperty('--rm-footer-h');
        root.classList.remove('rm-has-footer');
      }
    } catch (e) {}
  }
  function queue() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(sync);
  }
  function init() {
    try { if (window.ResizeObserver) ro = new ResizeObserver(queue); } catch (e) {}
    sync();
    window.addEventListener('resize', queue);
    window.addEventListener('orientationchange', function () { setTimeout(queue, 300); });
    try {
      // pindah halaman = class .active berubah; cukup pantau atribut class pada page-section
      new MutationObserver(queue).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true, childList: false });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


/* ===== TAMPILAN SEPERTI APLIKASI ASLI: TIDAK BISA DI-ZOOM (semua halaman, hanya di dalam APK/PWA) =====
   - viewport dikunci (tanpa pinch-zoom), double-tap zoom dimatikan, gesture zoom iOS/desktop diblok
   - area cropper foto profil tetap boleh pakai 2 jari (itu bukan zoom halaman) */
(function () {
  if (!window.RM_IS_APP) return;
  var VP = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover';
  function lockViewport() {
    try {
      var m = document.querySelector('meta[name="viewport"]');
      if (!m) { m = document.createElement('meta'); m.name = 'viewport'; (document.head || document.documentElement).appendChild(m); }
      if (m.getAttribute('content') !== VP) m.setAttribute('content', VP);
    } catch (e) {}
  }
  lockViewport();
  try {
    new MutationObserver(lockViewport).observe(document.head || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
  } catch (e) {}
  document.addEventListener('DOMContentLoaded', lockViewport);

  try {
    var st = document.createElement('style');
    st.setAttribute('data-rm', 'no-zoom');
    st.textContent =
      'html.rm-app,html.rm-app body{touch-action:pan-x pan-y;-webkit-text-size-adjust:100%;text-size-adjust:100%;-webkit-tap-highlight-color:transparent;}' +
      'html.rm-app img{-webkit-user-drag:none;}' +
      'html.rm-app .cropper-container,html.rm-app .cropper-container *{touch-action:none;}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  function inCropper(t) { try { return !!(t && t.closest && t.closest('.cropper-container')); } catch (e) { return false; } }
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
  });
  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1 && !inCropper(e.target)) e.preventDefault();
  }, { passive: false });
  document.addEventListener('wheel', function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) e.preventDefault();
  });
})();
