let deletionNoticeShown = false;

// ================= MODE MAINTENANCE (TUTUP/BUKA WEB) =================
let _moCountdownTimer = null;
let _mwBannerTimer = null;

function _moFormatCountdown(msRemaining) {
    if (msRemaining < 0) msRemaining = 0;
    const totalSec = Math.floor(msRemaining / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return { days, hours, minutes, seconds };
}
function _pad2(n) { return String(n).padStart(2, '0'); }

function _startOverlayCountdown(targetTime) {
    clearInterval(_moCountdownTimer);
    const wrap = document.getElementById('moCountdownWrap');
    const indef = document.getElementById('moIndefinite');

    if (!targetTime) {
        // Tidak ada durasi (tutup manual) -> tampilkan pesan menunggu, sembunyikan countdown
        if (wrap) wrap.style.display = 'none';
        if (indef) indef.style.display = 'block';
        return;
    }
    if (wrap) wrap.style.display = 'block';
    if (indef) indef.style.display = 'none';

    const tick = () => {
        const remaining = new Date(targetTime).getTime() - Date.now();
        if (remaining <= 0) {
            clearInterval(_moCountdownTimer);
            checkMaintenanceMode(); // waktu habis, langsung sinkron ulang ke server
            return;
        }
        const { days, hours, minutes, seconds } = _moFormatCountdown(remaining);
        const elDays = document.getElementById('moDays');
        const elHours = document.getElementById('moHours');
        const elMinutes = document.getElementById('moMinutes');
        const elSeconds = document.getElementById('moSeconds');
        if (elDays) elDays.innerText = _pad2(days);
        if (elHours) elHours.innerText = _pad2(hours);
        if (elMinutes) elMinutes.innerText = _pad2(minutes);
        if (elSeconds) elSeconds.innerText = _pad2(seconds);
    };
    tick();
    _moCountdownTimer = setInterval(tick, 1000);
}

function _startBannerCountdown(targetTime) {
    clearInterval(_mwBannerTimer);
    const tick = () => {
        const remaining = new Date(targetTime).getTime() - Date.now();
        const elCountdown = document.getElementById('mwBannerCountdown');
        if (remaining <= 0) {
            clearInterval(_mwBannerTimer);
            checkMaintenanceMode(); // masa peringatan habis, langsung sinkron ulang ke server
            return;
        }
        const { days, hours, minutes, seconds } = _moFormatCountdown(remaining);
        let text = '';
        if (days > 0) text = `${days}h ${_pad2(hours)}j ${_pad2(minutes)}m`;
        else if (hours > 0) text = `${hours}j ${_pad2(minutes)}m ${_pad2(seconds)}d`;
        else text = `${_pad2(minutes)}:${_pad2(seconds)}`;
        if (elCountdown) elCountdown.innerText = text;
    };
    tick();
    _mwBannerTimer = setInterval(tick, 1000);
}

async function checkMaintenanceMode() {
    try {
        const res = await fetch('/api/maintenance-status');
        const d = await res.json();

        const overlay = document.getElementById('maintenanceOverlay');
        const banner = document.getElementById('maintenanceWarningBanner');
        if (!overlay || !banner) return;

        const _nm = window.RM_IS_APP ? 'Aplikasi' : 'Website';
        const _setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };
        _setTxt('mwBannerName', _nm);
        _setTxt('moTitle', _nm + ' Sedang Diperbaiki');
        _setTxt('moCountdownLabel', _nm + ' akan buka dalam');

        if (!d || d.status === 'active') {
            overlay.style.display = 'none';
            banner.style.display = 'none';
            document.body.style.overflow = '';
            clearInterval(_moCountdownTimer);
            clearInterval(_mwBannerTimer);
            return;
        }

        if (d.status === 'warning') {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
            clearInterval(_moCountdownTimer);
            banner.style.display = 'block';
            _startBannerCountdown(d.warning_ends_at);
            return;
        }

        if (d.status === 'closed') {
            banner.style.display = 'none';
            clearInterval(_mwBannerTimer);
            overlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            if (d.message) {
                const sub = document.getElementById('moSubtitle');
                if (sub) sub.innerText = d.message;
            }
            _startOverlayCountdown(d.closed_until);
            return;
        }
    } catch (e) {
        // Kalau gagal cek (misal lagi offline), jangan block website
    }
}

function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatRupiah(angka) {
    return 'Rp' + parseFloat(angka).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============ DETAIL PEMBELI OTOMATIS DI SEMUA POPUP KONFIRMASI ============
// Menambahkan baris Nama, Username, No. WhatsApp & Tanggal Transaksi
// ke SEMUA popup "Rincian" (sama seperti pola FF & ML), tanpa perlu
// mengubah HTML tiap modal satu-satu — cukup panggil fungsi ini sebelum
// modal dibuka.
function formatTanggalWaktuID(d) {
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const tgl = String(d.getDate()).padStart(2, '0');
    const jam = String(d.getHours()).padStart(2, '0');
    const menit = String(d.getMinutes()).padStart(2, '0');
    return `${tgl} ${bulan[d.getMonth()]} ${d.getFullYear()}, ${jam}:${menit} WIB`;
}

function fillBuyerInfoForModal(modalId) {
    const modalEl = document.getElementById(modalId);
    if (!modalEl) return;
    const box = modalEl.querySelector('.invoice-box');
    if (!box) return;

    // Sisipkan baris data pembeli sekali saja (kalau belum ada)
    if (!box.querySelector('.buyer-info-row')) {
        box.insertAdjacentHTML('afterbegin', `
            <div class="inv-row buyer-info-row"><span class="inv-label"><i class="fas fa-user"></i> Nama Pembeli</span><span id="bi-name-${modalId}" class="inv-val">-</span></div>
            <div class="inv-row buyer-info-row"><span class="inv-label"><i class="fas fa-at"></i> Username</span><span id="bi-username-${modalId}" class="inv-val">-</span></div>
            <div class="inv-row buyer-info-row"><span class="inv-label"><i class="fab fa-whatsapp"></i> No. WhatsApp</span><span id="bi-phone-${modalId}" class="inv-val">-</span></div>
            <div class="inv-row buyer-info-row"><span class="inv-label"><i class="fas fa-clock"></i> Tanggal Transaksi</span><span id="bi-date-${modalId}" class="inv-val">-</span></div>
            <div class="buyer-info-divider" style="height:1px;background:#eee;margin:6px 0 2px;"></div>
        `);
    }

    let user = {};
    try { user = JSON.parse(localStorage.getItem('user')) || {}; } catch (e) { user = {}; }

    const nameEl = document.getElementById(`bi-name-${modalId}`);
    const userEl = document.getElementById(`bi-username-${modalId}`);
    const phoneEl = document.getElementById(`bi-phone-${modalId}`);
    const dateEl = document.getElementById(`bi-date-${modalId}`);

    if (nameEl) nameEl.innerText = user.fullname || '-';
    if (userEl) userEl.innerText = user.username ? '@' + user.username : '-';
    if (phoneEl) phoneEl.innerText = user.phone || '-';
    if (dateEl) dateEl.innerText = formatTanggalWaktuID(new Date());
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        Swal.fire({
            icon: 'success',
            title: 'Berhasil Disalin!',
            text: 'Data berhasil disalin ke clipboard.',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true
        });
    }).catch(() => {
        Swal.fire('Gagal', 'Tidak bisa menyalin teks.', 'error');
    });
}

function copySubdomainData(domain, node, ip) {
    const textToCopy = `DATA SUBDOMAIN\n\nMain: ${domain}\nNode: ${node}\nIP: ${ip}`;
    copyToClipboard(textToCopy);
}

function timeAgo(dateParam) {
    if (!dateParam) return "";
    const date = new Date(dateParam);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    let interval = seconds / 31536000;
    if (interval >= 1) return Math.floor(interval) + " tahun lalu";

    interval = seconds / 2592000;
    if (interval >= 1) return Math.floor(interval) + " bulan lalu";

    interval = seconds / 604800;
    if (interval >= 1) return Math.floor(interval) + " minggu lalu";

    interval = seconds / 86400;
    if (interval >= 1) return Math.floor(interval) + " hari lalu";

    interval = seconds / 3600;
    if (interval >= 1) return Math.floor(interval) + " jam lalu";

    interval = seconds / 60;
    if (interval >= 1) return Math.floor(interval) + " menit lalu";

    if (seconds < 10) return "Baru saja";
    return Math.floor(seconds) + " detik lalu";
}

function convertToLink(text) {
    if (!text) return '';
    
    // Escape HTML terlebih dahulu
    const escapeHtml = (str) => {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
    
    // Validasi URL (hanya http/https)
    const isValidUrl = (url) => {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    };
    
    const escapedText = escapeHtml(text);
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(?:com|net|org|id|co\.id|my\.id|web\.id|xyz|biz|info|me)[^\s]*)/gi;
    
    return escapedText.replace(urlRegex, function(url) {
        let href = url;
        if (!/^https?:\/\//i.test(url)) {
            href = 'https://' + url;
        }
        
        // Hanya tampilkan link jika URL valid
        if (isValidUrl(href)) {
            return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color: #2196F3; text-decoration: underline; font-weight: bold;">${escapeHtml(url)}</a>`;
        }
        return escapeHtml(url);
    });
}

const uploadDeline = async (blob) => {
    if (!blob) return null;
    
    // VALIDASI KEAMANAN FILE
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    const maxSize = 2 * 1024 * 1024; // 2MB
    
    if (!allowedTypes.includes(blob.type)) {
        Swal.fire('Error', 'Hanya file gambar (JPG, PNG, WEBP) yang diperbolehkan!', 'error');
        return null;
    }
    
    if (blob.size > maxSize) {
        Swal.fire('Error', 'Ukuran maksimal 2MB untuk gambar profil/banner!', 'error');
        return null;
    }
    
    // Cek nama file berbahaya
    const fileName = blob.name || 'image.jpg';
    const dangerousExt = ['.php', '.exe', '.js', '.html', '.htm', '.svg', '.xml'];
    if (dangerousExt.some(ext => fileName.toLowerCase().includes(ext))) {
        Swal.fire('Error', 'Tipe file tidak diizinkan!', 'error');
        return null;
    }
    
    // Gak upload ke luar lagi: ubah jadi data URL, server yang simpan ke folder sendiri
    return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => {
            Swal.fire('Error', 'Gagal membaca gambar, coba lagi!', 'error');
            resolve(null);
        };
        reader.readAsDataURL(blob);
    });
};

// ============ VARIABEL GLOBAL ============
const API_URL = "";
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const helpModal = document.getElementById('helpModal');
const caraBeliModal = document.getElementById('caraBeliModal');

// ============ CSRF TOKEN HANDLER ============

// originalFetch HARUS dideklarasikan PERTAMA sebelum fungsi lain memakainya
const originalFetch = window.fetch;

let csrfToken = null;
let isFetchingToken = false; // CEK APAKAH SEDANG AMBIL TOKEN

async function getCsrfToken() {
    // JANGAN cache token — server pakai single-use, ambil baru tiap request
    csrfToken = null;
    
    // CEK JANGAN SAMPAI LOOP
    if (isFetchingToken) {
        // Tunggu sampai token selesai diambil
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (!isFetchingToken) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 50);
        });
        return csrfToken;
    }
    
    isFetchingToken = true;
    
    try {
        // Selalu ambil token baru dari endpoint (single-use di server)
        // PAKAI ORIGINAL FETCH AGAR TIDAK LOOP
        const res = await originalFetch('/api/csrf-token', { method: 'GET' });
        const data = await res.json();
        if (data.token) {
            csrfToken = data.token;
            // Update meta tag
            let meta = document.querySelector('meta[name="csrf-token"]');
            if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'csrf-token';
                document.head.appendChild(meta);
            }
            meta.content = csrfToken;
        }
        return csrfToken;
    } catch (e) {
        console.log('Gagal ambil CSRF token:', e);
        return null;
    } finally {
        isFetchingToken = false;
    }
}

// Wrapper untuk fetch dengan CSRF token (HANYA UNTUK POST)
async function secureFetch(url, options = {}) {
    // HANYA untuk POST/PUT/DELETE
    if (!options.method || options.method === 'GET') {
        return originalFetch(url, options);
    }
    
    const token = await getCsrfToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['X-CSRF-Token'] = token;
    }
    
    const response = await originalFetch(url, {
        ...options,
        headers
    });
    
    // Jika CSRF error, reload page
    if (response.status === 403) {
        try {
            const data = await response.clone().json();
            if (data.message && data.message.includes('CSRF')) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Sesi Tidak Valid',
                    text: 'Halaman akan di-refresh untuk keamanan.',
                    timer: 2000,
                    showConfirmButton: false
                }).then(() => window.location.reload());
                throw new Error('CSRF Token Invalid');
            }
        } catch (e) {
            // Abaikan error parsing JSON
        }
    }
    
    return response;
}

// Interceptor untuk semua fetch (AMAN)
window.fetch = function(url, options) {
    // Skip untuk API eksternal dan request ke /api/csrf-token
    if (typeof url === 'string') {
        // JANGAN interceptor untuk request CSRF token sendiri
        if (url.includes('/api/csrf-token')) {
            return originalFetch(url, options);
        }
        
        // Skip untuk API eksternal
        if (url.startsWith('http') && !url.includes(window.location.hostname)) {
            return originalFetch(url, options);
        }
    }
    
    // HANYA untuk POST/PUT/DELETE ke internal API
    if (options && options.method && options.method !== 'GET') {
        return secureFetch(url, options);
    }
    
    return originalFetch(url, options);
};
const keuntunganModal = document.getElementById('keuntunganModal');
const confirmModal = document.getElementById('confirmModalOverlay');
const modalDeposit = document.getElementById('modalDeposit');
const customAlertModal = document.getElementById('customAlertModal');
const invoiceModal = document.getElementById('invoiceModal');
const dateFilterModal = document.getElementById('dateFilterModal');
const panelPopupModal = document.getElementById('panelPopupModal');
const bottomNav = document.getElementById('bottomNav');
const productGrid = document.getElementById('productGrid');
const cropModal = document.getElementById('cropModal');
const imageToCrop = document.getElementById('imageToCrop');

let cropper = null;
let currentCropType = null;
let pendingProfileBlob = null;
let pendingBannerBlob = null;
let myChart = null;

let scripts = [];
let selectedScriptCode = null;
let selectedScriptPrice = 0;
let selectedScriptData = null;
let selectedMethodScript = 'saldo'; // default, satu-satunya metode saat ini

let muridPackages = [];
let selectedMuridCode = null;
let selectedMuridPrice = 0;
let selectedMuridData = null;
let selectedMethodMurid = 'saldo'; // default, satu-satunya metode saat ini

let vpsList = [];
let selectedVPSCode = null;
let selectedVPSPrice = 0;

let premiumAppList = [];
let selectedPremiumApp = null;
let premiumAppQty = 1;
let selectedVPSData = null;
let selectedMethodVPS = 'saldo'; // default, satu-satunya metode saat ini

let sosmedServices = [];
let sosmedPricing = { flat: 3000, min_order: 5000 }; // dikirim server lewat /api/sosmed/services (server tetap jadi penentu)
let selectedSosmedService = null;
let selectedMethodSosmed = 'saldo'; // default, satu-satunya metode saat ini
let sosmedCategories = [];

let cfZones = [];
let selectedZone = null;
let selectedMethodSub = 'saldo'; // default, satu-satunya metode saat ini

let allTransactions = [];
let products = [];
let selectedProductCode = null;
let selectedPrice = 0;
let selectedMethod = 'saldo'; // default, satu-satunya metode saat ini
let globalBalance = 0;
let isBalanceHidden = localStorage.getItem('isBalanceHidden') === 'true';
let isInfoMenuOpened = false;
let latestActivityId = localStorage.getItem('latestActivityId') || "";
let lastReadActivityId = localStorage.getItem('lastReadActivityId') || "";
let activityData = [];

let secretTapCount = 0;
let secretTapTimer = null;

// Game
let gameProducts = [];
let selectedGameCode = null;
let selectedGamePrice = 0;
let selectedGameData = null;
let selectedMethodGame = null;
let checkedGameUser = null;

// Game Mobile Legends (tanpa cek nickname, cuma User ID + Zone ID)
let mlGameProducts = [];
let mlMembershipProducts = [];
let selectedMLCode = null;
let selectedMLPrice = 0;
let selectedMLData = null;
let selectedMLMembershipCode = null;
let selectedMLMembershipPrice = 0;
let selectedMLMembershipData = null;
let selectedMethodML = null;

// E-Wallet DANA
let ewalletProducts = [];
let selectedEwalletCode = null;
let selectedEwalletPrice = 0;
let selectedEwalletData = null;
let selectedMethodEwallet = 'saldo'; // default, satu-satunya metode saat ini
let checkedEwalletUser = null;

// GoPay Driver
let ewalletProductsGD = [];
let selectedEwalletCodeGD = null;
let selectedEwalletPriceGD = 0;
let selectedEwalletDataGD = null;
let selectedMethodEwalletGD = 'saldo'; // default, satu-satunya metode saat ini
let checkedEwalletUserGD = null;

// GoPay Customer
let ewalletProductsGopay = [];
let selectedEwalletCodeGopay = null;
let selectedEwalletPriceGopay = 0;
let selectedEwalletDataGopay = null;
let selectedMethodEwalletGopay = 'saldo'; // default, satu-satunya metode saat ini
let checkedEwalletUserGopay = null;

// OVO
let ovoProducts = [];
let selectedOvoCode = null;
let selectedOvoPrice = 0;
let selectedOvoData = null;
let selectedMethodOvo = 'saldo'; // default, satu-satunya metode saat ini
let checkedOvoUser = null;

// ShopeePay
let shopeeProducts = [];
let selectedShopeeCode = null;
let selectedShopeePrice = 0;
let selectedShopeeData = null;
let selectedMethodShopee = 'saldo'; // default, satu-satunya metode saat ini
let checkedShopeeUser = null;

// LinkAja
let linkajaProducts = [];
let selectedLinkajaCode = null;
let selectedLinkajaPrice = 0;
let selectedLinkajaData = null;
let selectedMethodLinkaja = 'saldo'; // default, satu-satunya metode saat ini
let checkedLinkajaUser = null;

// Astrapay
let astrapayProducts = [];
let selectedAstrapayCode = null;
let selectedAstrapayPrice = 0;
let selectedAstrapayData = null;
let selectedMethodAstrapay = 'saldo'; // default, satu-satunya metode saat ini
let checkedAstrapayUser = null;

// iSaku
let isakuProducts = [];
let selectedIsakuCode = null;
let selectedIsakuPrice = 0;
let selectedIsakuData = null;
let selectedMethodIsaku = 'saldo'; // default, satu-satunya metode saat ini
let checkedIsakuUser = null;

// Kaspro
let kasproProducts = [];
let selectedKasproCode = null;
let selectedKasproPrice = 0;
let selectedKasproData = null;
let selectedMethodKaspro = 'saldo'; // default, satu-satunya metode saat ini
let checkedKasproUser = null;

// ============ E-WALLET BEBAS NOMINAL ============
let bebasProducts = [];
let selectedBebasProduct = null;
let selectedBebasNominal = 0;
let selectedBebasFee = 0;
let selectedBebasTotal = 0;
let selectedMethodBebas = 'saldo'; // default, satu-satunya metode saat ini
let checkedBebasUser = null;

// ============ PROMO GLOBAL ============
let appliedPromo = {
    panel: null,
    script: null,
    murid: null,
    vps: null,
    sosmed: null,
    subdomain: null,
    game: null,
    ewallet: null,
    'ewallet-gd': null,
    'ewallet-gopay': null,
    'ewallet-ovo': null,
    'ewallet-shopee': null,
    'ewallet-linkaja': null,
    'ewallet-astrapay': null,
    'ewallet-isaku': null,
    'ewallet-kaspro': null
};

let originalPrice = {
    panel: 0,
    script: 0,
    murid: 0,
    vps: 0,
    sosmed: 0,
    subdomain: 0,
    game: 0,
    ewallet: 0,
    'ewallet-gd': 0,
    'ewallet-gopay': 0,
    'ewallet-ovo': 0,
    'ewallet-shopee': 0,
    'ewallet-linkaja': 0,
    'ewallet-astrapay': 0,
    'ewallet-isaku': 0,
    'ewallet-kaspro': 0
};

try {
    const cached = localStorage.getItem('cachedActivityData');
    if (cached) activityData = JSON.parse(cached);
} catch (e) {
    activityData = [];
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    checkMaintenanceMode();
    setInterval(checkMaintenanceMode, 10000); // sinkron ulang tiap 10 detik biar status selalu update

    // ========== CLEANUP DATA CORRUPT ==========
    try {
        const userData = localStorage.getItem('user');
        if (userData) {
            JSON.parse(userData);
        }
    } catch (e) {
        console.log("User data corrupt, menghapus...");
        localStorage.removeItem('user');
        localStorage.removeItem('token');
    }
    
    try {
        const pendingTrx = localStorage.getItem('pendingTrx');
        if (pendingTrx) {
            JSON.parse(pendingTrx);
        }
    } catch (e) {
        console.log("PendingTrx data corrupt, menghapus...");
        localStorage.removeItem('pendingTrx');
    }
    // ========== END CLEANUP ==========
    
    initGamingLoader();
    const { user } = checkLogin();
    updateUIUser(user);
    loadUserData(); // Pindahkan loadUserData kesini
    fetchProducts();
    setupEventListeners();
    setupAuthLogic();
    handleInitialNavigation();
    setupPromoListeners();
    syncOneSignalTag(); // Pastikan tag username OneSignal selalu sinkron di semua halaman
    autoIzinNotifApk(); // APK: minta izin notifikasi otomatis saat pertama masuk
    
    if(user) {
        globalBalance = user.balance;
        startSessionHeartbeat();
    }
    renderBalance();
    loadStats();
    loadInfoPage();

    setInterval(() => checkPublicActivity(false), 10000);
    setInterval(() => checkNewTransfer(), 10000);
    setTimeout(() => {
        setupAccordion();
    }, 500);

    if (localStorage.getItem('openKelas') === 'true') {
        localStorage.removeItem('openKelas');
        setTimeout(() => document.getElementById('menuKelasSaya')?.click(), 1000);
    }

    if (localStorage.getItem('openRiwayatSMM') === 'true') {
        localStorage.removeItem('openRiwayatSMM');
        setTimeout(() => document.getElementById('menuRiwayatSMM')?.click(), 1000);
    }
});

// ============ SCROLL OTOMATIS BERTAHAP ============
function autoScrollToNextStepByPage(pageName, currentStepIndex) {
    const container = document.querySelector(`#page-${pageName} .panel-content`);
    if (!container) return;
    
    const stepBoxes = container.querySelectorAll('.step-box');
    if (currentStepIndex + 1 < stepBoxes.length) {
        const nextStep = stepBoxes[currentStepIndex + 1];
        const elementPosition = nextStep.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - 70;
        
        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
        
        // Efek highlight
        nextStep.style.transition = 'all 0.3s ease';
        nextStep.style.boxShadow = '0 0 0 2px var(--primary-color)';
        nextStep.style.backgroundColor = 'rgba(33, 150, 243, 0.05)';
        setTimeout(() => {
            nextStep.style.boxShadow = '';
            nextStep.style.backgroundColor = '';
        }, 1000);
    }
}

function scrollToBuyButton(pageName) {
    const buyBtn = document.querySelector(`#page-${pageName} .sticky-footer .btn-buy`);
    if (buyBtn && buyBtn.classList.contains('active')) {
        const elementPosition = buyBtn.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - 70;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
        
        buyBtn.style.animation = 'pulse 0.5s ease-in-out 2';
        setTimeout(() => { buyBtn.style.animation = ''; }, 1000);
    }
}

// ============ LOADER ============
function initGamingLoader() {
    const loader = document.getElementById('newLoadingOverlay');
    if (!loader) return;

    // VERSI APK (PWA terinstall dibuka dari homescreen) -> langsung skip loading, tanpa animasi
    const isStandalone = !!window.RM_IS_APP || window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
        loader.remove();
        try { if (typeof checkPublicActivity === 'function') checkPublicActivity(true); } catch(e) {}
        try {
            const promoModal = document.getElementById('promoApkModal');
            const hidePromoApk = localStorage.getItem('hideApkPromoBanner') === 'true';
            if (promoModal && !hidePromoApk) promoModal.classList.add('show');
        } catch(e) {}
        return;
    }

    const quotes = [
        "\"Top Up Cepat, Gaming Hebat!\"",
        "\"Solusi Digital Sultan Terpercaya\"",
        "\"Sistem Sedang Menyiapkan Produk Termurah...\"",
        "\"Connecting to Server...\""
    ];
    
    const quoteElement = document.querySelector('.loader-quotes');
    if (quoteElement) {
        quoteElement.innerText = quotes[Math.floor(Math.random() * quotes.length)];
    }
    // Ucapan selamat datang sesuai jam + nama pengguna
    try {
        const hr = new Date().getHours();
        const sapa = hr < 11 ? 'Selamat pagi' : hr < 15 ? 'Selamat siang' : hr < 18 ? 'Selamat sore' : 'Selamat malam';
        const g = document.getElementById('loaderGreet');
        if (g) g.innerText = sapa + ' 👋';
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        const n = document.getElementById('loaderName');
        if (n && u && u.username) n.innerText = '@' + u.username;
    } catch (e) {}
    const progressBar = document.getElementById('loadingProgressBar');
    const percentageText = document.getElementById('loadingPercentage');

    let progress = 0;
    let timeoutTriggered = false;

    function forceHideLoader() {
        if (timeoutTriggered) return;
        timeoutTriggered = true;
        if (loader) {
            loader.style.opacity = '0';
            loader.style.transition = 'opacity 0.6s ease';
            setTimeout(() => {
                try { if (loader && loader.parentNode) loader.remove(); } catch(e) {}
                try { if (typeof checkPublicActivity === 'function') checkPublicActivity(true); } catch(e) {}
                try {
                    const promoModal = document.getElementById('promoApkModal');
                    if (promoModal) promoModal.classList.add('show');
                } catch(e) {}
            }, 600);
        }
    }

    // SAFETY TIMEOUT - Paksa hilang setelah 4 detik
    const safetyTimeout = setTimeout(() => {
        console.log("[Loader] Safety timeout triggered");
        forceHideLoader();
    }, 4000);

    // Juga paksa hilang saat halaman selesai load (fallback ganda)
    // Cek dulu: kalau sudah 'complete' (misal dari cache), langsung hide
    if (document.readyState === 'complete') {
        setTimeout(forceHideLoader, 500);
    } else {
        window.addEventListener('load', () => {
            setTimeout(forceHideLoader, 500);
        }, { once: true });
    }

    const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 10) + 6;
        if (progress > 100) progress = 100;
        
        if (progressBar) progressBar.style.width = progress + '%';
        if (percentageText) percentageText.innerText = progress + '%';

        if (progress >= 100) {
            clearInterval(interval);
            clearTimeout(safetyTimeout);
            setTimeout(forceHideLoader, 300);
        }
    }, 80); 
}

// ============ CAROUSEL (AUTO + GESER MANUAL PAKAI JARI / MOUSE) ============
const track = document.getElementById('carouselTrack');
let idx = 0;
let slideTimer;
let totalSlides = track ? track.children.length : 0;

function updateCarousel() {
    if (!track) return;
    track.style.transform = `translateX(-${idx * 100}%)`;
    document.querySelectorAll('.carousel-dots .dot').forEach((d, i) => {
        d.classList.toggle('active', i === idx);
    });
}

function startAutoSlide() {
    clearInterval(slideTimer);
    if (totalSlides < 2) return;
    slideTimer = setInterval(() => {
        idx = (idx + 1) % totalSlides;
        updateCarousel();
    }, 3500);
}

if (track && totalSlides) {
    startAutoSlide();

    // Dot bisa diklik
    document.querySelectorAll('.carousel-dots .dot').forEach((d, i) => {
        d.addEventListener('click', () => { idx = i; updateCarousel(); startAutoSlide(); });
    });

    // Geser manual: banner ikut jari selama digeser, lalu pindah slide kalau cukup jauh
    track.style.touchAction = 'pan-y';   // scroll atas-bawah tetap jalan
    track.style.userSelect = 'none';
    track.querySelectorAll('img').forEach(im => { im.draggable = false; });

    let startX = 0, startY = 0, dx = 0, dragging = false, locked = false, pid = null;

    track.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true; locked = false; dx = 0;
        startX = e.clientX; startY = e.clientY; pid = e.pointerId;
        clearInterval(slideTimer);
    });

    track.addEventListener('pointermove', (e) => {
        if (!dragging || e.pointerId !== pid) return;
        dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!locked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            if (Math.abs(dy) > Math.abs(dx)) { dragging = false; startAutoSlide(); return; } // user scroll vertikal
            locked = true;
            try { track.setPointerCapture(pid); } catch (_) {}
            track.style.transition = 'none';
        }
        track.style.transform = `translateX(calc(-${idx * 100}% + ${dx}px))`;
    });

    const endDrag = (e) => {
        if (!dragging || (e && e.pointerId !== pid)) return;
        dragging = false;
        track.style.transition = '';
        const threshold = Math.min(60, track.offsetWidth * 0.15);
        if (locked) {
            if (dx < -threshold && idx < totalSlides - 1) idx++;
            else if (dx > threshold && idx > 0) idx--;
            else if (dx < -threshold) idx = 0;                    // dari terakhir -> kembali ke awal
            else if (dx > threshold) idx = totalSlides - 1;       // dari pertama -> ke terakhir
        }
        locked = false;
        updateCarousel();
        startAutoSlide();
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
}

// ============ AUTENTIKASI & CEK SESI EXPIRED ============
function checkLogin() {
    // >>> GANTI DENGAN KODE checkLogin BARU DI SINI <<<
    const token = localStorage.getItem('token');
    
    if (token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error("Invalid token format");
            }
            
            const base64Url = parts[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            const payload = JSON.parse(jsonPayload);
            const now = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp < now) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                
                Swal.fire({
                    icon: 'warning',
                    title: 'Sesi Berakhir',
                    text: 'Sesi login Anda telah habis demi keamanan. Silakan login kembali.',
                    confirmButtonText: 'Login Ulang',
                    allowOutsideClick: false
                }).then(() => {
                    window.location.href = '/login';
                });
                throw new Error("TOKEN_EXPIRED");
            }
        } catch (e) {
            if (e.message === "TOKEN_EXPIRED") throw e;
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            return { token: null, user: null };
        }
    }
    
    try {
        const userJson = localStorage.getItem('user');
        if (!userJson) return { token: null, user: null };
        const user = JSON.parse(userJson);
        return { token, user };
    } catch (e) {
        console.error("Gagal parse user dari localStorage:", e);
        localStorage.removeItem('user');
        return { token: null, user: null };
    }
}

setInterval(() => {
    try { checkLogin(); } catch(e) {}
}, 5000);

function setupAuthLogic() {
    const formLog = document.getElementById('formLogin');
    if (formLog) {
        formLog.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = formLog.querySelector('button');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Masuk...';
            btn.disabled = true;

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: document.getElementById('logUser').value,
                        password: document.getElementById('logPass').value
                    })
                });
                const data = await res.json();
                if (data.success) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    if (window.RikiPush) {
                        RikiPush.setUser(data.user.username);
                        RikiPush.promptIfNeeded();
                    }

                    window.location.href = '/dasboard';
                } else {
                    Swal.fire('Login Gagal', data.message || 'Cek username/password', 'error');
                    btn.innerText = "MASUK";
                    btn.disabled = false;
                }
            } catch (e) {
                Swal.fire('Error', 'Gagal terhubung ke server', 'error');
                btn.innerText = "MASUK";
                btn.disabled = false;
            }
        });
    }
}

// ============ UPDATE UI ============
function updateUIUser(user) {
    const headerName = document.getElementById('headerName');
    const imgEl = document.getElementById('sideProfileImg');
    const nameEl = document.getElementById('sideName');
    const userEl = document.getElementById('sideUsername');
    const phoneEl = document.getElementById('sidePhone');
    const menuAuth = document.getElementById('menuAuth');

    // Bersihkan sisa efek lama
    document.querySelectorAll('.css-mahkota, .mahkota-sultan-css').forEach(el => el.remove());
    document.querySelectorAll('.sultan-container, .sultan-container-wrapper, .sultan-avatar-glow').forEach(el => {
        el.classList.remove('sultan-container', 'sultan-container-wrapper', 'sultan-avatar-glow');
    });

    if (user) {
        const trxCount = user.stat_trx_count || 0;
        const isSultan = user.is_sultan === true; // Hanya dapat centang & warna kuning jika tembus 5jt (Permanen)
        const sultanIcon = '<i class="fas fa-check-circle blue-shiny-check" style="font-size:0.85em; margin-left: 4px;"></i>';

        // ========== HEADER HOME (Hai, Nama) ==========
        if (headerName) {
            if (isSultan) {
                // NAMA BERKILAU + CENTANG + GLOW
                headerName.innerHTML = `Hai, <span class="sultan-name-shiny sultan-name-glow">${escapeHtml(user.fullname)}</span> ${sultanIcon}`;
            } else {
                headerName.innerHTML = `Hai, ${escapeHtml(user.fullname)}`;
            }
        }

        // ========== SIDEBAR ==========
        if (imgEl) { imgEl.onerror = function () { this.onerror = null; this.src = 'images/default-user.png'; }; imgEl.src = user.profile_img || 'images/default-user.png'; }
        
        // Cari container avatar
        const allAvatarContainers = document.querySelectorAll('.profile-pic-container, .avatar-wrapper');
        allAvatarContainers.forEach(container => {
            const profileImg = container.querySelector('img');
            
            if (isSultan) {
                if (profileImg) profileImg.classList.add('sultan-avatar-glow');
                if (!container.querySelector('.mahkota-sultan-css')) {
                    container.style.position = 'relative';
                    container.style.overflow = 'visible';
                    container.insertAdjacentHTML('beforeend', '<div class="mahkota-sultan-css"><i class="fas fa-crown"></i></div>');
                }
            } else {
                if (profileImg) profileImg.classList.remove('sultan-avatar-glow');
            }
        });

        // Nama lengkap di sidebar (BERKILAU)
        if (nameEl) {
            if (isSultan) {
                nameEl.classList.add('sultan-name-shiny', 'sultan-name-glow');
                nameEl.innerHTML = `${escapeHtml(user.fullname)} ${sultanIcon}`;
                nameEl.style.color = "";
                nameEl.style.textShadow = "";
            } else {
                nameEl.classList.remove('sultan-name-shiny', 'sultan-name-glow');
                nameEl.innerHTML = escapeHtml(user.fullname);
                nameEl.style.color = "";
            }
        }

        // Username di sidebar
        if (userEl) {
            if (isSultan) {
                userEl.innerHTML = `@${escapeHtml(user.username)} <span class="badge-sultan-emas">[ SULTAN ]</span>`;
                userEl.style.color = "#f39c12";
            } else {
                userEl.innerHTML = '@' + escapeHtml(user.username);
                userEl.style.color = "";
            }
        }

        if (phoneEl) phoneEl.innerText = user.phone || '-';

        // Menu Auth (Login/Logout)
        if (menuAuth) {
            menuAuth.innerHTML = '<i class="fas fa-sign-out-alt"></i> Keluar';
            menuAuth.style.color = '#e74c3c';
            menuAuth.onclick = () => {
                Swal.fire({
                    title: 'Keluar?',
                    text: "Anda harus login lagi nanti.",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Ya, Keluar',
                    confirmButtonColor: '#e74c3c'
                }).then((result) => {
                    if (result.isConfirmed) {
                        const _tok = localStorage.getItem('token') || '';
                        // Lepas notif akun dari perangkat ini DULU (sebelum localStorage dihapus)
                        (window.RikiPush && RikiPush.clearUser ? RikiPush.clearUser() : Promise.resolve()).then(() => {
                            { const _keep = localStorage.getItem('rm_apk_seen'); localStorage.clear(); if (_keep) localStorage.setItem('rm_apk_seen', _keep); }
                            // Hapus cookie + matikan sesi di server
                            fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: _tok }) }).finally(() => {
                                window.location.href = '/login';
                            });
                        });
                    }
                });
            };
        }

        // OneSignal
        if (window.RikiPush) { RikiPush.promptIfNeeded(); }
    } else {
        // User tidak login
        try { if (window.RikiPush && RikiPush.clearUser && !sessionStorage.getItem('rm_os_cleared')) { sessionStorage.setItem('rm_os_cleared', '1'); RikiPush.clearUser(); } } catch (e) {}
        if (headerName) headerName.innerText = "Hai, Tamu";
        if (imgEl) {
            imgEl.src = 'images/default-user.png';
            imgEl.classList.remove('sultan-avatar-glow');
        }
        if (nameEl) {
            nameEl.classList.remove('sultan-name-shiny', 'sultan-name-glow');
            nameEl.innerText = "Tamu";
        }
        if (userEl) {
            userEl.innerText = "Silakan Login";
        }
        if (phoneEl) phoneEl.innerText = "";

        if (menuAuth) {
            menuAuth.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
            menuAuth.style.color = '#e74c3c';
            menuAuth.onclick = () => window.location.href = '/login';
        }
    }
}

// ============ NAVIGASI ============
function handleInitialNavigation() {
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.page) renderPage(event.state.page);
        else renderPage('home');
        if (sidebar && sidebar.classList.contains('active')) closeSidebar();
        document.querySelectorAll('.modal, .confirm-modal-overlay').forEach(m => m.classList.remove('show'));
    });
    const hash = window.location.hash.replace('#', '');
    if (hash === 'transaksi-detail') {
        const savedTrx = sessionStorage.getItem('lastOpenedTrx');
        if (savedTrx) {
            try {
                renderPage('transaksi');
                setTimeout(() => openInvoice(JSON.parse(savedTrx)), 500);
            } catch(e) { renderPage('home'); }
        } else {
            renderPage('transaksi');
        }
    } else if (hash) {
        renderPage(hash);
    } else {
        renderPage('home');
    }
}

// ===== FUNGSI HALAMAN SUKSES PEMBELIAN (SALDO) =====
// Tutup SEMUA modal konfirmasi pembelian yang masih terbuka (confirm*Modal / confirm*ModalOverlay).
// Dipanggil otomatis tiap pindah halaman & saat halaman sukses tampil, jadi semua produk
// (murid, script, panel, vps, e-wallet, game, dll) tidak ada lagi popup yang "ngikutin".
function closeAllConfirmModals() {
    try {
        document.querySelectorAll('.confirm-modal-overlay.show[id^="confirm"]').forEach(m => m.classList.remove('show'));
    } catch (e) {}
}

function showPurchaseSuccessPage(config) {
    // config: { judul, subjudul, labelProduk, valueProduk, labelNominal, nominal, total, iconHtml, cekPesananFn }
    closeAllConfirmModals();

    loadUserData(); // Refresh saldo

    // Simpan data sukses ke localStorage agar bisa dibuka kembali setelah redirect
    if (config.pendingOrderData) {
        localStorage.setItem('pendingOpenInvoice', JSON.stringify(config.pendingOrderData));
    }

    const now = new Date();
    const tgl = now.toLocaleString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).replace('.', ':');

    const el = (id) => document.getElementById(id);

    // Ikon sukses seragam (SVG) - iconHtml dari pemanggil sengaja diabaikan agar warna tidak campur
    if (el('osJudul'))        el('osJudul').innerText        = config.judul    || 'PESANAN BERHASIL';
    if (el('osSubjudul'))     el('osSubjudul').innerText     = config.subjudul || 'Pembayaran via Saldo berhasil diproses.';
    if (el('osTanggal'))      el('osTanggal').innerText      = tgl;
    if (el('osLabelProduk'))  el('osLabelProduk').innerText  = config.labelProduk  || 'Produk';
    if (el('osValueProduk'))  el('osValueProduk').innerHTML  = config.valueProduk  || '-';
    if (el('osLabelNominal')) el('osLabelNominal').innerText = config.labelNominal || 'Harga';
    if (el('osNominal'))      el('osNominal').innerText      = config.nominal      ? 'Rp ' + parseInt(config.nominal).toLocaleString('id-ID') : '-';
    if (el('osTotal'))        el('osTotal').innerText        = config.total        ? 'Rp ' + parseInt(config.total).toLocaleString('id-ID')   : '-';

    // Sembunyikan baris produk jika tidak ada
    if (el('osRowProduk')) el('osRowProduk').style.display = config.valueProduk ? 'flex' : 'none';
    if (el('osRowNominal')) el('osRowNominal').style.display = config.nominal ? 'flex' : 'none';

    // ID transaksi
    if (el('osRowOrderId')) {
        el('osRowOrderId').style.display = config.lastOrderId ? 'flex' : 'none';
        if (el('osOrderId')) el('osOrderId').innerText = config.lastOrderId || '-';
    }

    // Tombol Cek Pesanan
    const btnCek = el('osBtnCekPesanan');
    if (btnCek) {
        btnCek.innerHTML = '<span>' + (config.cekTeks || 'CEK PESANAN') + '</span>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
        btnCek.onclick = () => {
            if (typeof config.cekPesananFn === 'function' && config.skipRedirect) {
                config.cekPesananFn();
                return;
            }
            if (config.lastOrderId) {
                localStorage.setItem('pendingOpenOrderId', config.lastOrderId);
            }
            switchPage('home');
            setTimeout(() => {
                const pendingId = localStorage.getItem('pendingOpenOrderId');
                if (pendingId) {
                    localStorage.removeItem('pendingOpenOrderId');
                    switchPage('transaksi');
                    setTimeout(() => {
                        const trx = allTransactions.find(t => t.order_id === pendingId);
                        if (trx) openInvoice(trx);
                    }, 800);
                } else if (typeof config.cekPesananFn === 'function') {
                    config.cekPesananFn();
                } else {
                    switchPage('transaksi');
                }
            }, 300);
        };
    }

    switchPage('order-sukses');
}
// ===== END FUNGSI HALAMAN SUKSES =====


let stockAllGamesCache=[];
async function loadStockAllGames(){
  const grid=document.getElementById('stockGameUserGrid'); if(!grid)return;
  grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-sub)"><i class="fas fa-spinner fa-spin"></i> Memuat...</div>';
  try{const r=await fetch('/api/stock-games');const d=await r.json();stockAllGamesCache=d.data||[];renderStockAllGames();}catch(e){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:30px;color:#ef4444">Gagal memuat stock game.</div>';}
}
function renderStockAllGames(){
  const g=document.getElementById('stockGameUserGrid');if(!g)return;
  if(!stockAllGamesCache.length){g.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-sub)">Belum ada game yang tersedia.</div>';return;}
  g.innerHTML=stockAllGamesCache.map((x,i)=>{const img=x.images?.[0]||'https://img.icons8.com/color/96/controller.png';return `<div onclick="openStockGameDetail(${i})" style="background:var(--card-bg,#fff);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.05)"><img src="${img}" style="width:100%;aspect-ratio:1.15;object-fit:cover"><div style="padding:10px"><div style="font-weight:800;font-size:14px">${escapeStockHtml(x.name)}</div><div style="font-size:11px;color:var(--text-sub);margin-top:3px">Stock: ${Number(x.stock||0)}</div><div style="font-weight:800;color:var(--primary-color);margin-top:6px">Rp ${Number(x.price||0).toLocaleString('id-ID')}</div></div></div>`}).join('');
}
function escapeStockHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function openStockGameDetail(i){
  const x=stockAllGamesCache[i];if(!x)return;
  const imgs=x.images||[];
  document.getElementById('stockGameDetailModal').style.display='flex';
  document.getElementById('stockGameDetailContent').innerHTML=`<h2 style="margin:4px 0 12px">${escapeStockHtml(x.name)}</h2><div style="display:flex;gap:8px;overflow:auto;padding-bottom:8px">${imgs.map((im,j)=>`<img src="${im}" onclick="zoomStockGameImage('${im}')" style="width:110px;height:110px;object-fit:cover;border-radius:10px;cursor:zoom-in;flex:none">`).join('')}</div><div style="background:var(--bg-color);padding:12px;border-radius:12px;margin-top:8px;white-space:pre-wrap;font-size:12px;line-height:1.6">${escapeStockHtml(x.description||'Tidak ada keterangan.')}</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px"><div><div style="font-size:11px;color:var(--text-sub)">Harga</div><div style="font-size:20px;font-weight:900;color:var(--primary-color)">Rp ${Number(x.price||0).toLocaleString('id-ID')}</div><div style="font-size:11px;color:var(--text-sub)">Stock: ${Number(x.stock||0)}</div></div><button onclick="checkoutStockGame('${x.code}')" style="background:var(--primary-color);color:#fff;border:0;border-radius:12px;padding:12px 16px;font-weight:800" ${Number(x.stock||0)<=0?'disabled':''}><i class="fab fa-whatsapp"></i> CHECKOUT & WHATSAPP</button></div>`;
}
function closeStockGameDetail(){document.getElementById('stockGameDetailModal').style.display='none';}
function zoomStockGameImage(src){const z=document.getElementById('stockGameImageZoom');document.getElementById('stockGameZoomImg').src=src;z.style.display='flex';}
async function checkoutStockGame(code){
  const token=localStorage.getItem('token');
  if(!token){window.location.href='/login';return;}
  const r=await fetch('/api/stock-games/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,product_code:code})});
  const d=await r.json();
  if(!d.success){Swal.fire('Gagal',d.message||'Gagal membuat order.','error');return;}
  closeStockGameDetail();
  await Swal.fire({icon:'success',title:'Order Dibuat',html:`<div style="font-size:12px">Order ID: <b>${escapeStockHtml(d.order_id)}</b><br>Produk: <b>${escapeStockHtml(d.product_name)}</b><br><br>Silakan lanjut ke WhatsApp Owner untuk proses manual.</div>`,showCancelButton:true,confirmButtonText:'CHAT WHATSAPP',cancelButtonText:'Nanti'}).then(r=>{if(r.isConfirmed)window.open(d.whatsapp_url,'_blank');});
}

function switchPage(pageName) {
    window.history.pushState({ page: pageName }, '', `#${pageName}`);
    renderPage(pageName);
}

function goBack() {
    window.history.back();
}

let historyInterval = null;

function updateCsFloat() {
    const f = document.getElementById('csFloat');
    const home = document.getElementById('page-home');
    if (f && home) f.classList.toggle('show', home.classList.contains('active'));
    if (f && home && !home.classList.contains('active') && window.csPanelClose) window.csPanelClose();
    if (f && home && home.classList.contains('active') && window.csFloatClamp) window.csFloatClamp();
}
window.addEventListener('DOMContentLoaded', updateCsFloat);

// Ukuran layar "efektif" (sudah dikoreksi jika tampilan diperbesar otomatis oleh app-detect.js)
function rmZoomFactor() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rm-zoom')) || 1; }
function rmVW() { return window.innerWidth / rmZoomFactor(); }
function rmVH() { return window.innerHeight / rmZoomFactor(); }

// CS melayang: bisa digeser (drag) ke posisi mana saja, menyelip ke pinggir saat scroll
(function () {
    const KEY = 'cs_float_pos';
    let f = null, dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0, pid = null, scrollT = null;

    // Skala layar vs ukuran CSS (beda tiap versi browser kalau tampilan di-zoom oleh app-detect.js),
    // jadi diukur langsung supaya geser/posisi tombol selalu pas.
    function sc() {
        if (!f || !f.offsetWidth) return 1;
        const s = f.getBoundingClientRect().width / f.offsetWidth;
        return (s > 0.2 && s < 8) ? s : 1;
    }
    // posisi tombol sekarang (satuan CSS, tidak terpengaruh animasi/transform)
    function pos() {
        const cs = getComputedStyle(f);
        return { x: parseFloat(cs.left) || 0, y: parseFloat(cs.top) || 0 };
    }
    // batas bawah = tepi atas menu bawah, supaya tombol tidak ketutup menu
    function navTop(s) {
        const n = document.getElementById('bottomNav');
        if (n && n.style.display !== 'none') {
            const r = n.getBoundingClientRect();
            if (r.height > 0) return r.top / s;
        }
        return rmVH() - 12;
    }

    function clamp() {
        if (!f || !f.style.left) return;
        const w = f.offsetWidth, h = f.offsetHeight;
        if (!w || !h) return;                       // lagi disembunyikan (bukan di Home)
        const maxY = Math.max(70, navTop(sc()) - h - 10);
        const x = Math.min(Math.max(6, parseFloat(f.style.left)), rmVW() - w - 6);
        const y = Math.min(Math.max(70, parseFloat(f.style.top)), maxY);
        f.style.left = x + 'px'; f.style.top = y + 'px';
        f.classList.toggle('on-left', x + w / 2 < rmVW() / 2);
        f.classList.toggle('peek-left', x + w / 2 < rmVW() / 2);
    }
    window.csFloatClamp = clamp;
    function place(x, y) {
        f.style.left = x + 'px'; f.style.top = y + 'px';
        f.style.right = 'auto'; f.style.bottom = 'auto';
        clamp();
    }
    function init() {
        f = document.getElementById('csFloat');
        if (!f || f.dataset.csInit) return;
        f.dataset.csInit = '1';
        try {
            const p = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (p && typeof p.x === 'number') place(p.x * rmVW(), p.y * rmVH());
        } catch (_) {}

        f.addEventListener('pointerdown', (e) => {
            dragging = true; moved = false; pid = e.pointerId;
            const q = pos();
            sx = e.clientX; sy = e.clientY; ox = q.x; oy = q.y;
        });
        f.addEventListener('pointermove', (e) => {
            if (!dragging || e.pointerId !== pid) return;
            const dx = e.clientX - sx, dy = e.clientY - sy;
            if (!moved && Math.hypot(dx, dy) < 8) return;
            if (!moved) { moved = true; f.classList.add('dragging'); try { f.setPointerCapture(pid); } catch (_) {} }
            const s = sc();
            place(ox + dx / s, oy + dy / s);
        });
        const end = (e) => {
            if (!dragging || (e && e.pointerId !== pid)) return;
            dragging = false;
            f.classList.remove('dragging');
            if (moved) {
                const q = pos(), w = f.offsetWidth;
                // nempel ke sisi layar terdekat biar rapi
                const left = q.x + w / 2 < rmVW() / 2;
                place(left ? 8 : rmVW() - w - 8, q.y);
                try { localStorage.setItem(KEY, JSON.stringify({ x: parseFloat(f.style.left) / rmVW(), y: parseFloat(f.style.top) / rmVH() })); } catch (_) {}
            }
        };
        f.addEventListener('pointerup', end);
        f.addEventListener('pointercancel', end);
        // habis digeser jangan dianggap klik (jangan buka popup)
        f.addEventListener('click', (e) => { if (moved) { e.stopImmediatePropagation(); e.preventDefault(); moved = false; } }, true);

        window.addEventListener('scroll', () => {
            if (!f.classList.contains('show') || dragging) return;
            f.classList.add('peek');
            clearTimeout(scrollT);
            scrollT = setTimeout(() => f.classList.remove('peek'), 900);
        }, { passive: true });
        window.addEventListener('resize', clamp);
    }
    // === Panel balon chat yang keluar dari karakter ===
    function panelEl() { return document.getElementById('csPanel'); }
    function openPanel() {
        const p = panelEl(); if (!p || !f) return;
        clamp();
        const vw = rmVW(), vh = rmVH();
        const w = f.offsetWidth, h = f.offsetHeight, q = pos();
        const pw = Math.min(260, vw - 24);
        p.style.width = pw + 'px';
        const cx = q.x + w / 2;
        let left = Math.min(Math.max(12, cx - pw * (cx > vw / 2 ? 0.82 : 0.18)), vw - pw - 12);
        p.style.left = left + 'px'; p.style.right = 'auto';
        const tail = Math.min(Math.max(24, cx - left), pw - 24);
        p.style.setProperty('--tail-x', tail + 'px');
        p.style.setProperty('--origin-x', tail + 'px');
        p.classList.add('open');            // ukur tinggi setelah tampil
        const ph = p.offsetHeight;
        const spaceAbove = q.y;
        const spaceBelow = navTop(sc()) - (q.y + h);
        // taruh di atas karakter; kalau tidak muat dan di bawah lebih lega, taruh di bawah
        const below = (q.y < ph + 80) && (spaceBelow > spaceAbove);
        p.classList.toggle('below', below);
        if (below) { p.style.top = (q.y + h + 12) + 'px'; p.style.bottom = 'auto'; }
        else { p.style.bottom = (vh - q.y + 12) + 'px'; p.style.top = 'auto'; }
        f.classList.add('talking');
        setTimeout(() => f.classList.remove('talking'), 1100);
    }
    function closePanel() { const p = panelEl(); if (p) p.classList.remove('open'); }
    window.csPanelClose = closePanel;

    function initPanel() {
        const fl = document.getElementById('csFloat');
        if (!fl || fl.dataset.csPanel) return;
        fl.dataset.csPanel = '1';
        fl.addEventListener('click', () => {
            const p = panelEl();
            if (p && p.classList.contains('open')) closePanel(); else openPanel();
        });
        document.getElementById('csPanelClose')?.addEventListener('click', closePanel);
        document.addEventListener('pointerdown', (e) => {
            const p = panelEl();
            if (p && p.classList.contains('open') && !p.contains(e.target) && !fl.contains(e.target)) closePanel();
        });
        window.addEventListener('scroll', closePanel, { passive: true });
        window.addEventListener('resize', closePanel);
    }
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => { init(); initPanel(); }); else { init(); initPanel(); }
})();

function renderPage(pageName) {
    closeAllConfirmModals();
    if (pageName === 'apk' && window.RM_IS_APP) pageName = 'home';   // APK: halaman download APK tidak tersedia
    setTimeout(updateCsFloat, 0);
    window.scrollTo(0, 0);
    document.body.scrollTop = 0; 
    document.documentElement.scrollTop = 0;

    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + pageName);

    if (target) {
        target.classList.add('active');

        if (pageName === 'stock-all-game') { loadStockAllGames(); }
        if (pageName === 'transaksi') {
            if (allTransactions.length === 0) loadHistory();
            if (!historyInterval) historyInterval = setInterval(loadHistory, 5000);
        } else {
            if (historyInterval) {
                clearInterval(historyInterval);
                historyInterval = null;
            }
        }
        if (pageName === 'panel') {
            const savedUser = localStorage.getItem('saved_panel_user');
            if (document.getElementById('panelUser')) document.getElementById('panelUser').value = savedUser || '';
            document.querySelectorAll('.pay-method-item').forEach(el => el.classList.remove('active'));
            if (products.length === 0) fetchProducts();
            else renderProducts();
            checkOrder();
        }
        if (pageName === 'script') {
            if (scripts.length === 0) fetchScripts();
            else renderScripts();
        }
        if (pageName === 'murid') {
            if (muridPackages.length === 0) fetchMurid();
            else renderMurid();
        }
        if (pageName === 'vps') {
            if (vpsList.length === 0) fetchVPS();
            else renderVPS();
        }
        if (pageName === 'premium-app') {
            if (premiumAppList.length === 0) loadPremiumApps();
        }
        if (pageName === 'nokos-provider' && typeof window.initNokosProviderPage === 'function') window.initNokosProviderPage();
        if (pageName === 'nokos2' && typeof window.initNokos2Page === 'function') window.initNokos2Page();
        if (pageName === 'nokos' && typeof window.initNokosPage === 'function') window.initNokosPage();
        if (pageName === 'nokos-history' && typeof window.initNokosHistory === 'function') window.initNokosHistory();
        if (pageName === 'sosmed') {
            if (sosmedServices.length === 0) fetchSosmedServices();
        }
        if (pageName === 'akun') loadProfilePage();
        if (pageName === 'rekap') loadRekapPage();
        if (pageName === 'game-ff') {
            fetchGameProductsFF();
            resetGameInputs();
        }
        if (pageName === 'game-ml') {
            fetchGameProductsML();
            resetMLInputs();
        }
        if (pageName === 'ewallet-dana') {
            fetchEwalletProductsDANA();
            resetEwalletInputs();
        }
        if (pageName === 'ewallet-gd') {
            fetchEwalletProductsGD();
            resetEwalletInputsGD();
        }
        if (pageName === 'ewallet-gopay') {
            fetchEwalletProductsGopay();
            resetEwalletInputsGopay();
        }
        if (pageName === 'ewallet-ovo') {
            fetchOvoProducts();
            resetOvoInputs();
        }
        if (pageName === 'ewallet-shopee') {
            fetchShopeeProducts();
            resetShopeeInputs();
        }
        if (pageName === 'ewallet-linkaja') {
            fetchLinkajaProducts();
            resetLinkajaInputs();
        }
        if (pageName === 'ewallet-astrapay') {
            fetchAstrapayProducts();
            resetAstrapayInputs();
        }
        if (pageName === 'ewallet-isaku') {
            fetchIsakuProducts();
            resetIsakuInputs();
        }
        if (pageName === 'ewallet-kaspro') {
            fetchKasproProducts();
            resetKasproInputs();
        }
        if (pageName === 'subdomain') {
            fetchCFZones();
        }
    } else {
        document.getElementById('page-home').classList.add('active');
    }

    if (bottomNav) {
        if (pageName === 'panel' || pageName === 'script' || pageName === 'murid' ||
            pageName === 'vps' || pageName === 'sosmed' ||
            pageName === 'game-ff' || pageName === 'game-ml' || pageName === 'ewallet-dana' || pageName === 'ewallet-gd' ||
            pageName === 'ewallet-gopay' || pageName === 'ewallet-ovo' || pageName === 'ewallet-shopee' ||
            pageName === 'ewallet-linkaja' || pageName === 'ewallet-astrapay' || pageName === 'ewallet-isaku' ||
            pageName === 'ewallet-kaspro' || pageName === 'ewallet-bebas' || pageName === 'subdomain' ||
            pageName === 'thr' || pageName === 'gacha' || pageName === 'apk') {
            bottomNav.style.display = 'none';
        } else {
            bottomNav.style.display = 'flex';
            updateActiveNav(pageName);
        }
    }
}

function updateActiveNav(pageName) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-target') === pageName) item.classList.add('active');
    });
}

function openSidebar() {
    sidebar.classList.add('active');
    overlay.classList.add('show');
}

function closeSidebar() {
    sidebar.classList.remove('active');
    overlay.classList.remove('show');
}

// ============ SALDO ============
function toggleBalance() {
    isBalanceHidden = !isBalanceHidden;
    localStorage.setItem('isBalanceHidden', isBalanceHidden);
    renderBalance();
}

function switchSaldoTab(tab) {
    const panelAktif = document.getElementById('panelSaldoAktif');
    const panelQris = document.getElementById('panelSaldoQris');
    const tabAktif = document.getElementById('tabSaldoAktif');
    const tabQris = document.getElementById('tabSaldoQris');
    if (!panelAktif || !panelQris) return;

    if (tab === 'aktif') {
        panelAktif.style.display = 'block';
        panelQris.style.display = 'none';
        tabAktif.style.color = 'var(--primary-color)';
        tabAktif.style.borderBottomColor = 'var(--primary-color)';
        tabQris.style.color = 'var(--text-sub)';
        tabQris.style.borderBottomColor = 'transparent';
    } else {
        panelAktif.style.display = 'none';
        panelQris.style.display = 'block';
        tabAktif.style.color = 'var(--text-sub)';
        tabAktif.style.borderBottomColor = 'transparent';
        tabQris.style.color = '#2ecc71';
        tabQris.style.borderBottomColor = '#2ecc71';
        loadQrisBalanceHome();
    }
}

async function loadQrisBalanceHome() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const res = await fetch('/api/qris-statis/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        const el = document.getElementById('saldoQrisText');
        if (el) {
            el.innerHTML = (data.success && data.data.is_active)
                ? 'Rp' + (data.data.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '<span style="font-size:13px;color:#e74c3c;"><i class="fas fa-lock"></i> Terkunci - sambungkan Telegram di menu QRIS Statis</span>';
        }
    } catch (e) {
        const el = document.getElementById('saldoQrisText');
        if (el) el.innerHTML = '<span style="font-size:13px;color:#e74c3c;">Gagal memuat</span>';
    }
}

function renderBalance() {
    const saldoEl = document.getElementById('saldoText');
    const eyeEl = document.getElementById('eyeIcon');

    if (!saldoEl || !eyeEl) return;

    if (isBalanceHidden) {
        saldoEl.innerHTML = `Rp•••••••• <div style="font-size:12px; color:#7f8c8d; margin-top:3px; font-weight:600;">= Rm ••••••••</div>`;
        saldoEl.style.fontSize = '22px';
        saldoEl.style.color = 'var(--primary-color)';
        eyeEl.classList.remove('fa-eye');
        eyeEl.classList.add('fa-eye-slash');
    } else {
        const saldoRupiah = parseFloat(globalBalance);
        
        // --- RUMUS KURS PASTI TNG ---
        // Karena Rp 80.000 = Rm 18.36, patokannya adalah 18.36 dibagi 80000
        const kursPasti = 18.36 / 80000; 
        const saldoRinggit = (saldoRupiah * kursPasti).toFixed(2); 
        
        // Format Rupiah gaya Internasional/Malaysia (Rp80,000.00)
        const formatSaldoIdr = saldoRupiah.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        saldoEl.innerHTML = `Rp${formatSaldoIdr} <div style="font-size:12px; color:#7f8c8d; margin-top:3px; font-weight:600;">= Rm ${saldoRinggit}</div>`;
        saldoEl.style.fontSize = '22px';
        saldoEl.style.color = 'var(--primary-color)';
        eyeEl.classList.remove('fa-eye-slash');
        eyeEl.classList.add('fa-eye');
    }
}

// ============ MODAL ============
function showCustomAlert(message, title = "Informasi") {
    const titleEl = document.getElementById('alertTitle');
    const msgEl = document.getElementById('alertMessage');
    if (titleEl && msgEl && customAlertModal) {
        titleEl.innerText = title;
        msgEl.innerText = message;
        customAlertModal.classList.add('show');
    } else {
        alert(message);
    }
}

function openClaimModal() {
    Swal.fire({
        title: 'Klaim Garansi',
        html: `
            <div style="text-align:left; font-size:12px; color:#666; margin-bottom:15px;">
                Pastikan kode garansi valid dan masa garansi belum habis (20 hari, atau 30 hari untuk Panel Unli).
            </div>
            <input id="claimCode" class="swal2-input" placeholder="Masukkan Kode Garansi" style="font-size:14px;">
            <input id="claimUser" class="swal2-input" placeholder="Username Baru (Min 3 Huruf)" style="font-size:14px;">
        `,
        confirmButtonText: 'Proses Klaim',
        confirmButtonColor: '#e74c3c',
        showCancelButton: true,
        cancelButtonText: 'Batal',
        preConfirm: () => {
            const code = document.getElementById('claimCode').value;
            const user = document.getElementById('claimUser').value;
            if (!code || !user) Swal.showValidationMessage('Data tidak boleh kosong!');
            if (user.length < 3) Swal.showValidationMessage('Username minimal 3 karakter!');
            return { code, user };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const { code, user } = result.value;
            const { token } = checkLogin();
            Swal.fire({
                title: 'Sedang Memproses...',
                html: 'Mohon tunggu, sedang membuat panel pengganti.',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                const res = await fetch('/api/claim-warranty', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, warranty_code: code, new_username: user })
                });
                const d = await res.json();

                if (d.success) {
                    Swal.fire('Berhasil!', d.message, 'success').then(() => {
                        document.getElementById('menuPanelPopup').click();
                    });
                } else {
                    Swal.fire('Gagal', d.message, 'error');
                }
            } catch (e) {
                Swal.fire('Error', 'Gagal terhubung ke server', 'error');
            }
        }
    });
}

// ============ DATA USER ============
async function loadUserData() {
    const { token } = checkLogin();
    if (!token) return;
    try {
        const res = await fetch('/api/get-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const d = await res.json();
        if (d.success && d.user) {
            globalBalance = d.user.balance;
            renderBalance();
            
            // Update statistik transaksi
            const trxCountEl = document.getElementById('statTrxCount'); // Tampil di Halaman Utama
            if (trxCountEl) {
                trxCountEl.innerText = (d.user.stat_trx_bulan_ini || 0) + 'x';
            }
            
            const trxTotalAkunEl = document.getElementById('statTrxTotalAkun'); // Tampil di Halaman Akun
            if (trxTotalAkunEl) {
                trxTotalAkunEl.innerText = (d.user.stat_trx_count || 0); // huruf "x" sudah ada di HTML
            }

            // TRIGGER ANIMASI JIKA AWAL BULAN
            if (d.user.trigger_animasi && d.user.rekap_bulan_lalu > 0) {
                jalankanAnimasiRekap(d.user.rekap_bulan_lalu);
            }
            
            const totalSpentEl = document.getElementById('statTotalSpent');
            if (totalSpentEl) {
                totalSpentEl.innerText = 'Rp ' + parseInt(d.user.stat_month_spent || 0).toLocaleString('id-ID');
            }
            
            // Update localStorage dan UI
            localStorage.setItem('user', JSON.stringify(d.user));
            updateUIUser(d.user);

            // Popup notif hapus akun otomatis (7 hari) - hanya sekali, khusus akun baru
            if (d.user.deletion_notice_seen === false && !deletionNoticeShown) {
                deletionNoticeShown = true;
                Swal.fire({
                    icon: 'warning',
                    title: 'Perhatian, Akun Baru!',
                    html: 'Jika akun ini tidak pernah melakukan transaksi dalam <b>7 hari</b> sejak pendaftaran, sistem akan <b>menghapus akun secara otomatis</b>.<br><br>Segera lakukan transaksi apapun agar akunmu aman dan tidak terhapus.',
                    confirmButtonText: 'OK, Saya Sudah Membaca',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                }).then(() => {
                    fetch('/api/mark-deletion-notice-seen', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token })
                    }).catch(() => {});
                });
            }
            
            // Sinkron preferensi "jangan tampilkan lagi" popup promo APK dari akun
            const isStandaloneSync = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
            if (isStandaloneSync) {
                if (d.user.hide_promo_apk) {
                    localStorage.setItem('hideApkPromoBanner', 'true');
                    const promoModalSync = document.getElementById('promoApkModal');
                    if (promoModalSync) promoModalSync.classList.remove('show');
                } else {
                    localStorage.removeItem('hideApkPromoBanner');
                }
            }
        } else {
            console.warn("loadUserData: Response tidak valid", d);
            // Akun tidak ditemukan di server (kemungkinan sudah dihapus sistem) -> paksa logout
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            Swal.fire({
                icon: 'info',
                title: 'Sesi Berakhir',
                text: 'Akun tidak ditemukan atau sesi sudah tidak valid. Silakan login kembali.',
                confirmButtonText: 'Login Ulang',
                allowOutsideClick: false
            }).then(() => {
                window.location.href = '/login';
            });
        }
    } catch (e) {
        console.error("Gagal load user data:", e);
    }
}

async function loadStats() {
    try {
        // Tambahkan "?t=" + getTime() untuk mencegah cache browser/Cloudflare
        const res = await fetch('/api/stats?t=' + new Date().getTime()); 
        const d = await res.json();
        
        if (d.success) {
            if (document.getElementById('stMember')) {
                document.getElementById('stMember').innerText = d.member.toLocaleString('id-ID');
            }
            if (document.getElementById('stSukses')) {
                document.getElementById('stSukses').innerText = d.sukses.toLocaleString('id-ID');
            }
        }
    } catch (e) {
        console.log("Gagal load stats:", e);
    }
}
// ============ AKUN ============
async function loadProfilePage() {
    const { token } = checkLogin();
    if (!token) return window.location.href = '/login';
    try {
        const res = await fetch('/api/get-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const d = await res.json();
        if (d.success) {
            const u = d.user;
            const trxCount = u.stat_trx_count || 0;
            const isSultan = u.is_sultan === true; // Menggunakan status sultan dari server
            const sultanIcon = '<i class="fas fa-check-circle blue-shiny-check" style="font-size:0.85em; margin-left: 4px;"></i>';
            const nameDisplay = document.getElementById('accNameDisplay');
            const joinDisplay = document.getElementById('accJoinDate');
            
            // ========== DEKLARASI VARIABEL (PERBAIKAN UTAMA) ==========
            const profileImg = document.getElementById('displayProfile');
            const profileContainer = profileImg ? profileImg.parentElement : null;

            // Hapus mahkota lama biar tidak numpuk
            if (profileContainer) {
                profileContainer.querySelectorAll('.css-mahkota, .mahkota-sultan-css').forEach(el => el.remove());
            }

            if (isSultan) {
                // NAMA BERKILAU + CENTANG + GLOW di halaman Akun
                nameDisplay.classList.add('sultan-name-shiny', 'sultan-name-glow');
                nameDisplay.innerHTML = `${escapeHtml(u.fullname)} ${sultanIcon}`;
                nameDisplay.style.color = "";
                nameDisplay.style.textShadow = "";

                if (profileImg) profileImg.classList.add('sultan-avatar-glow');
                
                if (profileContainer) {
                    profileContainer.style.position = 'relative';
                    profileContainer.style.overflow = 'visible';
                    if (!profileContainer.querySelector('.mahkota-sultan-css')) {
                        profileContainer.insertAdjacentHTML('beforeend', '<div class="mahkota-sultan-css"><i class="fas fa-crown"></i></div>');
                    }
                }
            } else {
                nameDisplay.innerText = u.fullname;
                nameDisplay.style.color = "";
                nameDisplay.style.textShadow = "";
                if (profileImg) {
                    profileImg.classList.remove('sultan-avatar-glow');
                    profileImg.style.border = "4px solid var(--bg-card)";
                    profileImg.style.boxShadow = "0 4px 10px rgba(0,0,0,0.15)";
                }
            }
            
            // Set teks tanggal bergabung (contoh: "Mar 2025")
            if (joinDisplay && u.created_at) {
                joinDisplay.textContent = new Date(u.created_at).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
            }

            // --- KODE BARU: UPDATE STATUS TELEGRAM DI PROFIL ---
            const teleStatusDesc = document.getElementById('teleStatusDesc');
            const btnConnectTele = document.getElementById('btnConnectTele');

            if (teleStatusDesc && btnConnectTele) {
                if (u.telegram_id) {
                    teleStatusDesc.innerHTML = `<span style="color: #2ecc71; font-weight: 600;"><i class="fas fa-check-circle"></i> Terhubung</span> (@${u.telegram_username})`;
                    btnConnectTele.innerText = 'Terhubung';
                    btnConnectTele.style.color = '#fff';
                    btnConnectTele.style.background = '#2ecc71';
                    btnConnectTele.disabled = true;
                } else {
                    teleStatusDesc.innerText = 'Terima invoice via bot';
                    btnConnectTele.innerText = 'Sambungkan';
                    btnConnectTele.style.color = '#0088cc';
                    btnConnectTele.style.background = '#e3f2fd';
                    btnConnectTele.disabled = false;
                }
            }

            // Saldo
            document.getElementById('accBalance').innerText = 'Rp ' + parseInt(u.balance).toLocaleString('id-ID');

            if (document.getElementById('accUangMasuk'))
                document.getElementById('accUangMasuk').innerText = 'Rp ' + parseInt(u.stat_month_deposit || 0).toLocaleString('id-ID');

            if (document.getElementById('accUangKeluar'))
                document.getElementById('accUangKeluar').innerText = 'Rp ' + parseInt(u.stat_month_spent || 0).toLocaleString('id-ID');

            // Form edit profil
            document.getElementById('editFullname').value = u.fullname;
            document.getElementById('editUsername').value = '@' + u.username;
            const akUn = document.getElementById('akUsernameText'); if (akUn) akUn.textContent = '@' + u.username;
            
            // ==== LOGIKA NOMOR WHATSAPP ====
            const phoneInput = document.getElementById('editPhone');
            if (phoneInput) {
                const phoneWrap = phoneInput.parentElement;
                phoneWrap.style.position = 'relative'; 
                if (u.phone && !String(u.phone).startsWith("TEMP-") && u.phone !== "-") {
                    phoneInput.value = u.phone;
                    phoneInput.setAttribute('readonly', 'true');
                    if (!document.getElementById('badgePhone')) {
                        phoneWrap.insertAdjacentHTML('beforeend', '<div id="badgePhone" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #2ecc71; font-size: 18px; z-index: 5;"><i class="fas fa-check-circle"></i></div>');
                    }
                } else {
                    phoneInput.value = u.phone || '';
                    phoneInput.removeAttribute('readonly');
                }
            }

            // ==== LOGIKA EMAIL ====
            const emailInput = document.getElementById('editEmail');
            if (emailInput) {
                const emailWrap = emailInput.parentElement;
                emailWrap.style.position = 'relative'; 
                
                if (document.getElementById('badgeEmail')) document.getElementById('badgeEmail').remove();
                if (document.getElementById('btnVerifyEmail')) document.getElementById('btnVerifyEmail').remove();

                if (u.email && u.email !== '-' && u.email !== "") {
                    emailInput.value = u.email;
                    emailInput.setAttribute('readonly', 'true');
                    emailWrap.insertAdjacentHTML('beforeend', '<div id="badgeEmail" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #2ecc71; font-size: 18px; z-index: 5;"><i class="fas fa-check-circle"></i></div>');
                } else {
                    emailInput.value = '';
emailInput.placeholder = 'Email belum diverifikasi';
emailInput.removeAttribute('readonly');
emailWrap.insertAdjacentHTML('beforeend', '<button id="btnVerifyEmailNow" type="button" class="btn-buy" style="margin-top: 10px; width: 100%; font-size: 12px; padding: 8px; background: #95a5a6; color: white;"><i class="fas fa-envelope"></i> Verifikasi Email Sekarang</button>');

const verifyBtn = document.getElementById('btnVerifyEmailNow');
if (verifyBtn) {
    // Fungsi untuk update warna tombol berdasarkan isi email
    const updateButtonColor = () => {
        const emailVal = emailInput.value.trim();
        if (emailVal.length > 0 && emailVal.includes('@')) {
            verifyBtn.style.background = '#2ecc71'; // Hijau
            verifyBtn.style.color = 'white';
        } else {
            verifyBtn.style.background = '#95a5a6'; // Abu-abu
        }
    };

    // Update warna saat halaman dimuat
    updateButtonColor();

    // Update warna saat user mengetik di kolom email
    emailInput.addEventListener('input', updateButtonColor);

    // Event klik tombol verifikasi
    verifyBtn.addEventListener('click', () => {
        const emailVal = emailInput.value.trim();
        if (!emailVal || !emailVal.includes('@')) {
            Swal.fire('Error', 'Masukkan email yang valid terlebih dahulu!', 'warning');
            return;
        }
        document.getElementById('verifyEmailModal').classList.add('show');
        document.getElementById('newEmailInput').value = emailVal;
        document.getElementById('otpEmailSection').style.display = 'none';
        
        const btnSend = document.getElementById('btnSendEmailOtp');
        if (btnSend) {
            btnSend.style.display = 'block';
            btnSend.style.background = '#34495e';
        }
        
        document.getElementById('newEmailInput').removeAttribute('readonly');
        document.getElementById('emailOtpInput').value = '';
    });
}
                    
                    document.getElementById('btnVerifyEmail')?.addEventListener('click', () => {
                        document.getElementById('verifyEmailModal').classList.add('show');
                        document.getElementById('newEmailInput').value = emailInput.value; 
                        document.getElementById('otpEmailSection').style.display = 'none';
                        
                        const btnSend = document.getElementById('btnSendEmailOtp');
                        if (btnSend) {
                            btnSend.style.display = 'block';
                            btnSend.style.background = '#34495e'; 
                        }
                        
                        document.getElementById('newEmailInput').removeAttribute('readonly');
                        document.getElementById('emailOtpInput').value = '';
                    });
                }
            }

            ['editPhone', 'editEmail'].forEach(function (id) {
                const el = document.getElementById(id);
                if (el && el.parentElement) el.parentElement.classList.toggle('ro', el.hasAttribute('readonly'));
            });
            akSyncRows();
            akPinPaint(localStorage.getItem('rm_pin_on') === '1');

            // Profile & Banner Image
            if (u.profile_img) {
                const imgProf = document.getElementById('displayProfile');
                imgProf.src = u.profile_img;
                imgProf.onerror = function() { this.src = 'images/default-user.png'; }; 
            }
            if (u.banner_img) document.getElementById('displayBanner').style.backgroundImage = `url('${u.banner_img}')`;
            akSyncRows();
            loadLoginSessions();
        }
    } catch (e) {
        console.log(e);
    }
}

function setupAccountListeners() {
    document.getElementById('menuAkun')?.addEventListener('click', () => {
        closeSidebar();
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('akun');
            loadProfilePage();
            cekStatusPushNotif();
        }
    });

    const fileProf = document.getElementById('fileProfile');
    const fileBan = document.getElementById('fileBanner');

    fileProf?.addEventListener('change', function() {
        if (this.files && this.files[0]) openCropper(this.files[0], 'profile');
    });

    fileBan?.addEventListener('change', function() {
        if (this.files && this.files[0]) openCropper(this.files[0], 'banner');
    });

    const btnSave = document.getElementById('btnSaveProfile');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            btnSave.textContent = "Menyimpan...";
            btnSave.disabled = true;

            try {
                const fullname = document.getElementById('editFullname').value;
                const phone = document.getElementById('editPhone').value;
                let newProfileLink = null;
                let newBannerLink = null;

                if (pendingProfileBlob) {
                    newProfileLink = await uploadDeline(pendingProfileBlob);
                    if (!newProfileLink) throw new Error("Gagal upload foto profil");
                }
                if (pendingBannerBlob) {
                    newBannerLink = await uploadDeline(pendingBannerBlob);
                    if (!newBannerLink) throw new Error("Gagal upload banner");
                }

                const { token } = checkLogin();
                const bodyData = { token, fullname, phone };
                if (newProfileLink) bodyData.profile_img_data = newProfileLink;
                if (newBannerLink) bodyData.banner_img_data = newBannerLink;

                const res = await fetch('/api/update-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyData)
                });
                const result = await res.json();

                if (result.success) {
                    closeAkunScreen(); // kembali ke layar sebelumnya (Edit Profil)
                    Swal.fire({ icon: 'success', title: 'Tersimpan', text: result.message, timer: 1600, showConfirmButton: false });
                    pendingProfileBlob = null;
                    pendingBannerBlob = null;
                    localStorage.setItem('user', JSON.stringify(result.user));
                    updateUIUser(result.user);
                    loadProfilePage();
                } else {
                    Swal.fire('Gagal', result.message, 'error');
                }
            } catch (e) {
                Swal.fire('Error', e.message || 'Gagal menyimpan profil', 'error');
            } finally {
                btnSave.textContent = 'Simpan';
                btnSave.disabled = false;
            }
        });
    }

    document.getElementById('btnLogout')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Keluar Akun?',
            text: "Anda yakin ingin keluar?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Ya, Keluar',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#e74c3c'
        }).then((r) => {
            if (r.isConfirmed) {
                const _tok = localStorage.getItem('token') || '';
                (window.RikiPush && RikiPush.clearUser ? RikiPush.clearUser() : Promise.resolve()).then(() => {
                    { const _keep = localStorage.getItem('rm_apk_seen'); localStorage.clear(); if (_keep) localStorage.setItem('rm_apk_seen', _keep); }
                    fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: _tok }) }).finally(() => {
                        // Ganti history agar tombol back tidak kembali ke dashboard
                        history.replaceState(null, '', '/login');
                        window.location.replace('/');
                    });
                });
            }
        });
    });
}

function syncOneSignalTag() {
    if (!window.RikiPush) return;

    let user = null;
    try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch(e) {}
    if (!user || !user.username) return; // Belum login, skip

    // Pasang tag sekarang, dan pasang lagi kalau user baru mengaktifkan notifikasi
    RikiPush.setUser(user.username);
    RikiPush.run(function(OS) {
        try { if (window.Notification && Notification.permission === 'granted' && !OS.User.PushSubscription.optedIn) OS.User.PushSubscription.optIn(); } catch (e) {}
        OS.User.PushSubscription.addEventListener('change', function(ev) {
            if (ev && ev.current && ev.current.optedIn) RikiPush.setUser(user.username);
        });
    });
}

// ============ NOTIFIKASI PUSH ============
function _pushToast(icon, title, text, ms) {
    if (!window.Swal) return;
    Swal.fire({ icon: icon, title: title, text: text, timer: ms || 3500, showConfirmButton: false, toast: true, position: 'top-end', timerProgressBar: true });
}

// Tunggu OneSignal siap, tapi tidak menggantung selamanya (adblock / jaringan lambat -> null)
function _waitOneSignal(ms) {
    return new Promise(function (resolve) {
        let done = false;
        const t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms || 8000);
        (window.RikiOSReady || Promise.resolve(null)).then(function (OS) {
            if (done) return;
            done = true; clearTimeout(t);
            resolve(window.RikiOSInitError ? null : OS);
        });
    });
}

let _pushBusy = false;
async function aktifkanPushNotif() {
    if (_pushBusy) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        _pushToast('error', 'Tidak Didukung', 'Browser ini tidak mendukung notifikasi. Coba pakai Chrome terbaru.');
        return;
    }
    if (!window.isSecureContext) {
        _pushToast('error', 'Butuh HTTPS', 'Buka situs lewat alamat https:// supaya notifikasi bisa aktif.');
        return;
    }
    if (Notification.permission === 'denied') {
        _pushToast('error', 'Izin Diblokir', 'Buka ikon gembok di samping alamat situs > Izin > Notifikasi > Izinkan, lalu muat ulang halaman.', 6000);
        if (typeof setPushStatusUI === 'function') setPushStatusUI('denied');
        return;
    }

    _pushBusy = true;
    const btns = Array.from(document.querySelectorAll('#bannerPushNotif button, #btnProfPush'));
    const oldTexts = btns.map(function (b) { return b.innerText; });
    btns.forEach(function (b) { b.disabled = true; b.innerText = 'Memproses...'; });

    try {
        // 1) Minta izin LANGSUNG dari klik (kalau ditunda dulu menunggu OneSignal, browser bisa tidak memunculkan pop-up)
        let perm = Notification.permission;
        if (perm === 'default') {
            try { perm = await Notification.requestPermission(); } catch (e) {}
        }
        if (perm === 'denied') {
            _pushToast('error', 'Izin Ditolak', 'Izinkan notifikasi lewat pengaturan situs di browser, lalu coba lagi.', 5000);
            return;
        }
        if (perm !== 'granted') {
            _pushToast('warning', 'Belum Diizinkan', 'Pop-up izin ditutup atau tidak muncul. Tekan Aktifkan lagi lalu pilih Izinkan.', 5000);
            return;
        }

        // 2) Daftarkan perangkat ke OneSignal
        const OS = await _waitOneSignal(10000);
        if (!OS) {
            _pushToast('error', 'Layanan Notifikasi Gagal Dimuat', 'Matikan adblock / cek koneksi, lalu muat ulang halaman dan coba lagi.', 6000);
            return;
        }
        try { await OS.User.PushSubscription.optIn(); } catch (e) { console.log('[Push] optIn:', e); }

        let user = null;
        try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) {}
        if (user && user.username) {
            try {
                await OS.login(user.username); OS.User.addTag('username', user.username);
                const _sid = window.RikiPush && RikiPush.currentSid ? RikiPush.currentSid() : '';
                if (_sid) OS.User.addTag('sid', _sid);
            } catch (e) { console.log('[Push] login:', e); }
        }

        // Beri waktu OneSignal membuat subscription id
        for (let i = 0; i < 8 && !OS.User.PushSubscription.id; i++) {
            await new Promise(function (r) { setTimeout(r, 750); });
        }

        if (OS.User.PushSubscription.optedIn && OS.User.PushSubscription.id) {
            const banner = document.getElementById('bannerPushNotif');
            if (banner) banner.style.display = 'none';
            if (typeof setPushStatusUI === 'function') setPushStatusUI('on');
            _pushToast('success', 'Notifikasi Aktif!', 'Kamu akan dapat notif deposit, order, dan info penting.', 3000);
        } else {
            _pushToast('warning', 'Hampir Berhasil', 'Izin sudah diberikan tapi perangkat belum terdaftar. Muat ulang halaman lalu tekan Aktifkan lagi.', 6000);
        }
    } catch (e) {
        console.log('[Push] error:', e);
        _pushToast('error', 'Gagal Mengaktifkan', (e && e.message) ? e.message : 'Terjadi kesalahan, coba lagi.', 5000);
    } finally {
        _pushBusy = false;
        btns.forEach(function (b, i) { b.disabled = false; b.innerText = oldTexts[i]; });
        cekStatusPushNotif();
    }
}

// Banner "Aktifkan Notifikasi": tampil kalau perangkat ini BELUM terdaftar, sembunyi kalau sudah
async function cekStatusPushNotif() {
    const banner = document.getElementById('bannerPushNotif');
    if (!banner) return;
    if (!('Notification' in window)) { banner.style.display = 'none'; return; }
    if (Notification.permission !== 'granted') { banner.style.display = 'flex'; return; }
    const OS = await _waitOneSignal(8000);
    if (!OS || !OS.User) { banner.style.display = 'flex'; return; }
    const sub = OS.User.PushSubscription;
    banner.style.display = (sub.optedIn && sub.id) ? 'none' : 'flex';
}

// ============ IZIN NOTIF OTOMATIS (KHUSUS APK) ============
// Saat pertama kali masuk di APK (sudah login), tampil dialog sekali: tap "Izinkan" -> izin notifikasi
// diminta & perangkat didaftarkan. Tombol di menu Akun tetap ada sebagai cadangan.
async function autoIzinNotifApk() {
    try {
        if (!window.RM_IS_APP) return;                                   // hanya APK
        if (!('Notification' in window) || !window.isSecureContext) return;
        if (Notification.permission === 'denied') return;                // diblokir -> pakai menu Akun
        let user = null;
        try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) {}
        if (!user || !user.username) return;                             // belum login
        { const _t = parseInt(localStorage.getItem('rm_push_asked') || '0', 10); if (_t && Date.now() - _t < 86400000) return; } // maks 1x per hari kalau belum aktif
        await new Promise(function (r) { setTimeout(r, 2500); });        // tunggu layar tenang dulu
        const ov = document.getElementById('maintenanceOverlay');
        if (ov && ov.style.display !== 'none') return;                   // lagi maintenance
        if (window.Swal && Swal.isVisible()) return;                     // ada popup lain
        const OS = await _waitOneSignal(8000);
        if (OS && OS.User && Notification.permission === 'granted' &&
            OS.User.PushSubscription.optedIn && OS.User.PushSubscription.id) return; // sudah aktif
        try { localStorage.setItem('rm_push_asked', String(Date.now())); } catch (e) {}
        const r = await Swal.fire({
            icon: 'info',
            title: 'Aktifkan Notifikasi?',
            text: 'Biar kamu langsung dapat notif deposit, order, dan info dari admin.',
            confirmButtonText: 'Izinkan',
            showCancelButton: true,
            cancelButtonText: 'Nanti',
            allowOutsideClick: false
        });
        if (r.isConfirmed) aktifkanPushNotif();
    } catch (e) { console.log('[Push] auto izin APK:', e); }
}

// ====== HALAMAN AKUN: setiap fitur profil dibuka sebagai LAYAR PENUH (gaya TikTok), bukan popup ======
const akStack = [];
function openAkunScreen(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (akStack[akStack.length - 1] === id) return;
    if (id === 'akScrEdit' || id === 'akScrName' || id === 'akScrEmail' || id === 'akScrPhone') akSyncRows();
    el.classList.add('show');
    akStack.push(id);
    try { history.pushState({ page: 'akun', akScr: id }, ''); } catch (e) {}
    document.body.style.overflow = 'hidden';
    if (id === 'akScrSec') { loadLoginSessions(); akPinRefresh(); }
    if (id === 'akScrDiag') { try { cekStatusPushNotif(); } catch (e) {} }
}
function closeAkunScreen() { // tombol panah kembali -> sama seperti tombol back HP
    if (akStack.length) history.back();
}
function akHideTop() {
    const id = akStack.pop();
    if (id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); }
    if (!akStack.length) document.body.style.overflow = '';
    if (akStack.length) akSyncRows();
}
function closeAllAkunScreens() { while (akStack.length) akHideTop(); }
window.addEventListener('popstate', () => { if (akStack.length) akHideTop(); });
// kompatibilitas pemanggil lama
function openAkunSheet(id) { openAkunScreen(id === 'akunSheetSesi' ? 'akScrSec' : 'akScrEdit'); }
function closeAkunSheet() { closeAllAkunScreens(); }
function switchAkunTab(tab) {
    if (tab === 'sesi') openAkunScreen('akScrSec');
    else { closeAllAkunScreens(); cekStatusPushNotif(); }
}
function akLockedInfo(title, msg) { Swal.fire({ icon: 'info', title: title, text: msg, confirmButtonText: 'Mengerti' }); }

// isi ulang nilai di daftar "Edit Profil" dari kolom input
function akSyncRows() {
    const g = (id) => document.getElementById(id);
    if (!g('akValName')) return;
    g('akValName').textContent = (g('editFullname') && g('editFullname').value) || '-';
    g('akValUser').textContent = (g('editUsername') && g('editUsername').value) || '-';
    const em = g('editEmail'), ph = g('editPhone');
    const emOk = em && em.hasAttribute('readonly') && em.value;
    g('akValEmail').innerHTML = em && em.value ? (em.value.replace(/</g, '&lt;') + (emOk ? ' <i class="fas fa-check-circle ok"></i>' : '')) : 'Belum diverifikasi';
    g('akValEmail').classList.toggle('muted', !(em && em.value));
    const phOk = ph && ph.hasAttribute('readonly') && ph.value;
    g('akValPhone').innerHTML = ph && ph.value ? (ph.value.replace(/</g, '&lt;') + (phOk ? ' <i class="fas fa-check-circle ok"></i>' : '')) : 'Belum diisi';
    g('akValPhone').classList.toggle('muted', !(ph && ph.value));
    const sp = g('btnSavePhone'); if (sp) sp.hidden = !!(ph && ph.hasAttribute('readonly'));
    const av = g('akEditAvatar'), dp = g('displayProfile'); if (av && dp && dp.src) av.src = dp.src;
}

// ====== PIN KEAMANAN (opsional) ======
function akPinDelayLabel(sec) { return sec === 0 ? 'Langsung saat kembali ke aplikasi' : sec < 60 ? 'Setelah ' + sec + ' detik' : 'Setelah ' + (sec / 60) + ' menit'; }
function akPinPaint(on) {
    const g = (id) => document.getElementById(id);
    if (g('akPinSwitch')) g('akPinSwitch').classList.toggle('on', !!on);
    if (g('akPinRowChange')) g('akPinRowChange').style.display = on ? '' : 'none';
    if (g('akPinRowDelay')) g('akPinRowDelay').style.display = on ? '' : 'none';
    if (g('akPinDesc')) g('akPinDesc').textContent = on ? 'PIN aktif. Diminta saat buka aplikasi & setiap transaksi.' : 'Minta PIN saat membuka aplikasi dan setiap transaksi.';
    if (g('akPinSub')) g('akPinSub').textContent = on ? 'PIN aktif • perangkat yang login' : 'Kunci PIN & perangkat yang login';
    if (g('akPinDelayVal') && window.RMPin) g('akPinDelayVal').textContent = akPinDelayLabel(RMPin.getDelay());
}
async function akPinRefresh() {
    akPinPaint(localStorage.getItem('rm_pin_on') === '1'); // tampil dulu dari data lokal, lalu cocokkan dengan server
    try {
        const { token } = checkLogin();
        const r = await (await fetch('/api/pin/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })).json();
        if (r && r.success) { localStorage.setItem('rm_pin_on', r.enabled ? '1' : '0'); akPinPaint(r.enabled); }
    } catch (e) {}
}
async function akPinApi(path, body) {
    const { token } = checkLogin();
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) });
    return res.json();
}
async function akPinAskNew(titleA) {
    const p1 = await RMPin.prompt({ title: titleA || 'Buat PIN', sub: 'Masukkan 6 angka yang mudah kamu ingat' });
    if (!p1) return null;
    const p2 = await RMPin.prompt({ title: 'Ulangi PIN', sub: 'Masukkan PIN yang sama sekali lagi' });
    if (!p2) return null;
    if (p1 !== p2) { await Swal.fire('PIN tidak sama', 'Coba ulangi dari awal.', 'error'); return null; }
    return p1;
}
async function akPinToggle() {
    if (!window.RMPin) return Swal.fire('Error', 'Fitur PIN belum termuat. Muat ulang halaman.', 'error');
    if (localStorage.getItem('rm_pin_on') === '1') return akPinDisable();
    const pin = await akPinAskNew('Buat PIN');
    if (!pin) return;
    const r = await akPinApi('/api/pin/set', { pin });
    if (r.success) { RMPin.setEnabledHint(true); akPinPaint(true); Swal.fire({ icon: 'success', title: 'PIN aktif', text: 'Mulai sekarang PIN diminta saat membuka aplikasi dan setiap transaksi.', timer: 1800, showConfirmButton: false }); }
    else Swal.fire('Gagal', r.message || 'Gagal memasang PIN', 'error');
}
async function akPinChange() {
    const old = await RMPin.prompt({ title: 'PIN lama', sub: 'Masukkan PIN kamu saat ini' });
    if (!old) return;
    const chk = await akPinApi('/api/pin/verify', { pin: old });
    if (!chk.success) return Swal.fire('Gagal', chk.message || 'PIN salah', 'error');
    const pin = await akPinAskNew('PIN baru');
    if (!pin) return;
    const r = await akPinApi('/api/pin/set', { pin, old_pin: old });
    if (r.success) Swal.fire({ icon: 'success', title: 'PIN diganti', timer: 1500, showConfirmButton: false });
    else Swal.fire('Gagal', r.message || 'Gagal mengganti PIN', 'error');
}
async function akPinDisable() {
    const pin = await RMPin.prompt({ title: 'Matikan PIN', sub: 'Masukkan PIN kamu untuk mematikan' });
    if (!pin) return;
    const r = await akPinApi('/api/pin/disable', { pin });
    if (r.success) { localStorage.setItem('rm_pin_on', '0'); akPinPaint(false); Swal.fire({ icon: 'success', title: 'PIN dimatikan', timer: 1500, showConfirmButton: false }); }
    else Swal.fire('Gagal', r.message || 'PIN salah', 'error');
}
function akPinDelayPick() {
    Swal.fire({
        title: 'Kunci otomatis', input: 'select',
        inputOptions: { '0': 'Langsung saat kembali ke aplikasi', '30': 'Setelah 30 detik', '60': 'Setelah 1 menit', '300': 'Setelah 5 menit' },
        inputValue: String(RMPin.getDelay()), showCancelButton: true, confirmButtonText: 'Simpan', cancelButtonText: 'Batal'
    }).then((r) => { if (r.isConfirmed) { RMPin.setDelay(parseInt(r.value, 10)); akPinPaint(localStorage.getItem('rm_pin_on') === '1'); } });
}

// ============ CROPPER ============

// Unggah foto profil / banner langsung setelah di-crop (dengan loading & pesan sukses/gagal)
async function autoSaveProfileImage(type) {
    const blob = type === 'profile' ? pendingProfileBlob : pendingBannerBlob;
    if (!blob) return;
    Swal.fire({
        title: type === 'profile' ? 'Menyimpan foto profil...' : 'Menyimpan banner...',
        text: 'Mohon tunggu sebentar',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading()
    });
    try {
        const dataUrl = await uploadDeline(blob);
        if (!dataUrl) throw new Error('Foto tidak valid');
        const { token } = checkLogin();
        const body = { token };
        body[type === 'profile' ? 'profile_img_data' : 'banner_img_data'] = dataUrl;
        const res = await fetch('/api/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        let result;
        try { result = await res.json(); }
        catch (e) { throw new Error(res.status === 413 ? 'Ukuran foto terlalu besar' : 'Server tidak merespons (' + res.status + ')'); }
        if (!result.success) throw new Error(result.message || 'Gagal menyimpan foto');

        if (type === 'profile') pendingProfileBlob = null; else pendingBannerBlob = null;
        localStorage.setItem('user', JSON.stringify(result.user));
        updateUIUser(result.user);
        loadProfilePage();
        Swal.fire({
            icon: 'success',
            title: 'Berhasil!',
            text: type === 'profile' ? 'Foto profil berhasil diperbarui.' : 'Banner berhasil diperbarui.',
            timer: 2000,
            showConfirmButton: false
        });
    } catch (e) {
        if (type === 'profile') pendingProfileBlob = null; else pendingBannerBlob = null;
        Swal.fire('Gagal', e.message || 'Gagal menyimpan foto', 'error');
        loadProfilePage(); // kembalikan tampilan ke foto yang tersimpan di server
    }
}

function openCropper(file, type) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        imageToCrop.src = e.target.result;
        currentCropType = type;
        cropModal.classList.add('show');
        if (cropper) {
            cropper.destroy();
        }
        setTimeout(() => {
            cropper = new Cropper(imageToCrop, {
                aspectRatio: type === 'profile' ? 1 : 16 / 9,
                viewMode: 1,
                autoCropArea: 1,
                dragMode: 'move'
            });
        }, 200);
    };
    reader.readAsDataURL(file);
}

// ============ DEPOSIT ============
let currentActivePG = null;
let selectedZakkiQrType = 'v2'; // default GoPay

function selectZakkiQrType(type) {
    selectedZakkiQrType = type;
    const optGopay = document.getElementById('zakkiOptGopay');
    const optShopee = document.getElementById('zakkiOptShopee');
    if (!optGopay || !optShopee) return;
    if (type === 'v3') {
        optShopee.style.border = '2px solid var(--primary-color)';
        optShopee.style.background = 'rgba(33,150,243,0.08)';
        optGopay.style.border = '2px solid var(--border-color)';
        optGopay.style.background = 'var(--bg-body)';
    } else {
        optGopay.style.border = '2px solid var(--primary-color)';
        optGopay.style.background = 'rgba(33,150,243,0.08)';
        optShopee.style.border = '2px solid var(--border-color)';
        optShopee.style.background = 'var(--bg-body)';
    }
}

async function openDepositModal() {
    document.getElementById('modalDeposit').classList.add('show');
    const box = document.getElementById('zakkiQrTypeBox');
    if (!box) return;

    // Sembunyikan dulu selagi cek PG aktif
    box.style.display = 'none';

    try {
        const res = await fetch('/api/pg-active');
        const data = await res.json();
        currentActivePG = data.active || 'pakasir';
    } catch (e) {
        currentActivePG = null;
    }

    if (currentActivePG === 'zakki') {
        box.style.display = 'block';
        selectZakkiQrType(selectedZakkiQrType);
    }
}

function selectDepositAmount(amount, element) {
    const input = document.getElementById('depoAmount');
    input.value = amount;
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (element) {
        element.classList.add('active');
    }
}

async function processDeposit() {
    const amount = document.getElementById('depoAmount').value;
    if (amount < 1000) return showCustomAlert("Minimal deposit Rp 1.000", "Gagal");
    
    const btn = document.getElementById('btnProsesDeposit');
    const oldText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const { token, user } = checkLogin();
    Swal.fire({
        title: 'Membuat QRIS...',
        html: 'Mohon tunggu sebentar, sistem sedang memproses tagihanmu.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const res = await fetch('/api/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, amount, qr_type: selectedZakkiQrType })
        });
        const data = await res.json();
        
        if (data.success) {
            const expireTime = Date.now() + (5 * 60 * 1000);
            localStorage.setItem('pendingTrx', JSON.stringify({
                order_id: data.order_id,
                pay_amount: data.pay_amount,
                deposit_amount: data.amount,
                qr_string: data.qr_string,
                expire_at: expireTime,
                username: user ? user.username : 'Guest',
                trx_type: 'deposit'
            }));
            
            window.location.href = '/payment';
        } else {
            Swal.fire("Gagal!", data.message || "Gagal membuat tagihan.", "error");
        }
    } catch (err) {
        Swal.fire("Error", "Gagal terhubung ke server. Coba lagi.", "error");
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
}

// ============ REKAP ============
async function loadRekapPage() {
    const { token } = checkLogin();
    if (!token) return window.location.href = '/login';

    try {
        const res = await fetch('/api/rekap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const d = await res.json();

        if (d.success) {
            const rp = v => 'Rp ' + (parseInt(v) || 0).toLocaleString('id-ID');
            const totalIn = parseInt(d.total_in) || 0;
            const totalOut = parseInt(d.total_out) || 0;

            document.getElementById('rekIn').innerText = rp(totalIn);
            document.getElementById('rekOut').innerText = rp(totalOut);
            document.getElementById('rekCount').innerText = d.trx_count + ' Transaksi';
            document.getElementById('rekBal').innerText = rp(d.balance);

            // Net Flow (hero)
            const net = totalIn - totalOut;
            const netEl = document.getElementById('rekNet');
            netEl.innerText = (net >= 0 ? '+ ' : '- ') + rp(Math.abs(net));
            netEl.className = 'rkp-net-val ' + (net >= 0 ? 'pos' : 'neg');

            // Perbandingan masuk vs keluar
            const sum = totalIn + totalOut;
            const pctIn = sum ? Math.round((totalIn / sum) * 100) : 0;
            const pctOut = sum ? 100 - pctIn : 0;
            document.getElementById('rekBarIn').style.width = pctIn + '%';
            document.getElementById('rekPctIn').innerText = pctIn + '%';
            document.getElementById('rekPctOut').innerText = pctOut + '%';

            // Ringkasan 7 hari (dari data grafik)
            const dIn = (d.chart && d.chart.data_in) || [];
            const dOut = (d.chart && d.chart.data_out) || [];
            const labels = (d.chart && d.chart.labels) || [];
            const sum7In = dIn.reduce((a, b) => a + (parseInt(b) || 0), 0);
            const sum7Out = dOut.reduce((a, b) => a + (parseInt(b) || 0), 0);
            document.getElementById('rek7In').innerText = rp(sum7In);
            document.getElementById('rek7Out').innerText = rp(sum7Out);
            document.getElementById('rekAvg').innerText = rp(Math.round(sum7Out / 7));

            let busyIdx = -1, busyVal = 0;
            labels.forEach((l, i) => {
                const v = (parseInt(dIn[i]) || 0) + (parseInt(dOut[i]) || 0);
                if (v > busyVal) { busyVal = v; busyIdx = i; }
            });
            document.getElementById('rekBusy').innerText = busyIdx >= 0 ? labels[busyIdx] : '-';

            const emptyEl = document.getElementById('rekChartEmpty');
            if (emptyEl) emptyEl.style.display = (sum7In + sum7Out) === 0 ? 'flex' : 'none';

            renderWaveChart(d.chart);
        }
    } catch (e) {
        console.log(e);
    }
}

function renderWaveChart(chartData) {
    const ctx = document.getElementById('waveChart').getContext('2d');
    if (myChart) {
        myChart.destroy();
    }

    const dark = document.body.classList.contains('dark-mode');
    const tickColor = dark ? '#95a5a6' : '#7f8c8d';
    const gridColor = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
    const allZero = [...chartData.data_in, ...chartData.data_out].every(v => !parseInt(v));
    const short = v => v >= 1000000 ? (v / 1000000) + 'jt' : v >= 1000 ? (v / 1000) + 'rb' : v;

    // Garis ala chart trading (ringan: Chart.js + 1 plugin kecil untuk garis bidik)
    const crosshair = {
        id: 'rkpCrosshair',
        afterDatasetsDraw(chart) {
            const act = chart.tooltip && chart.tooltip.getActiveElements && chart.tooltip.getActiveElements();
            if (!act || !act.length) return;
            const { ctx: c, chartArea: ca } = chart;
            const x = act[0].element.x;
            c.save();
            c.setLineDash([4, 4]);
            c.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.35)';
            c.lineWidth = 1;
            c.beginPath(); c.moveTo(x, ca.top); c.lineTo(x, ca.bottom); c.stroke();
            c.restore();
        }
    };
    const mkGrad = (hex) => (context) => {
        const ch = context.chart;
        if (!ch.chartArea) return 'transparent';
        const g = ch.ctx.createLinearGradient(0, ch.chartArea.top, 0, ch.chartArea.bottom);
        g.addColorStop(0, hex + '55');
        g.addColorStop(1, hex + '00');
        return g;
    };
    const mkSet = (label, data, hex) => ({
        label, data, borderColor: hex, backgroundColor: mkGrad(hex),
        fill: true, tension: 0.25, borderWidth: 2.5,
        pointRadius: 3.5, pointHoverRadius: 6,
        pointBackgroundColor: hex, pointBorderColor: dark ? '#1e1e1e' : '#fff', pointBorderWidth: 2
    });

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                mkSet('Pemasukan', chartData.data_in, '#2ecc71'),
                mkSet('Pengeluaran', chartData.data_out, '#ff6b6b')
            ]
        },
        plugins: [crosshair],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.92)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    padding: 10,
                    cornerRadius: 10,
                    callbacks: {
                        label: c => ' ' + c.dataset.label + ': Rp ' + (c.parsed.y || 0).toLocaleString('id-ID')
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor, drawTicks: false },
                    border: { color: gridColor },
                    ticks: { color: tickColor, font: { size: 11, weight: '600' }, padding: 8 }
                },
                y: {
                    beginAtZero: true,
                    suggestedMax: allZero ? 10000 : undefined,
                    border: { display: false },
                    grid: { color: gridColor },
                    ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 5, callback: short }
                }
            },
            animation: { duration: 600, easing: 'easeOutQuart' }
        }
    });
}

// ============ PANEL ============
async function fetchProducts() {
    try {
        const res = await fetch('/api/products');
        const json = await res.json();
        if (json.success) {
            products = json.data;
            renderProducts();
        }
    } catch (e) {
        console.log("Gagal ambil produk");
    }
}

// Tampilan "Stok Kosong" kalau daftar produk sebuah layanan kosong (atau kategori dikunci HABIS oleh admin)
function stockEmptyHtml(namaLayanan) {
    return `<div class="stock-empty">
        <i class="fas fa-box-open"></i>
        <b>Stok Kosong</b>
        <span>${namaLayanan ? 'Layanan ' + namaLayanan + ' sedang kosong.' : 'Layanan ini sedang kosong.'}<br>Silakan cek lagi nanti ya 🙏</span>
    </div>`;
}

function renderProducts() {
    if (!productGrid) return;
    productGrid.innerHTML = '';
    if (!products || products.length === 0) { productGrid.innerHTML = stockEmptyHtml('Panel'); return; }

    products.forEach(p => {
        const isHabis = (p.active === false);
        let badgeNewHtml = '';
        if (p.createdAt) {
            const createdTime = new Date(p.createdAt).getTime();
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;
            if ((now - createdTime) < oneDay) {
                badgeNewHtml = `<div class="badge-new-item">NEW</div>`;
            }
        }

        const card = document.createElement('div');
        card.className = `prod-card ${isHabis ? 'disabled' : ''}`;

        if (!isHabis) {
            card.addEventListener('click', () => selectItem(card, p.code, p.price));
        }

        const badgeStock = isHabis ?
            `<div class="badge-habis">STOK KOSONG</div>` :
            `<div class="badge-ready">READY</div>`;

        card.innerHTML = `
            ${badgeNewHtml} 
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-server" style="font-size:28px; color:${isHabis ? '#bdc3c7' : '#3498db'}; margin-bottom:8px;"></i>
                <span class="prod-name" style="font-size:13px; margin-bottom:2px;">${p.name}</span>
                <span style="font-size:10px; color:#666;">RAM ${p.spec.ram}MB | CPU ${p.spec.cpu}% | DISK ${p.spec.disk}MB</span>
                ${badgeStock}
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        productGrid.appendChild(card);
    });
}

function selectItem(el, code, price) {
    document.querySelectorAll('.prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedProductCode = code;
    selectedPrice = price;
    checkOrder();
    resetPromo('panel');
    autoScrollToNextStepByPage('panel', 1);
}

function selectPayMethod(method) {
    selectedMethod = method;
    const nameElPanel = document.getElementById('metodeNamePanel');
    if (nameElPanel) nameElPanel.innerText = getMetodeLabel(method);
    const rincianNameElPanel = document.getElementById('rincianMetodeNamePanel');
    if (rincianNameElPanel) rincianNameElPanel.innerText = getMetodeLabel(method);
    checkOrder();
    setTimeout(() => scrollToBuyButton('panel'), 100);
}

function checkOrder() {
    const orderType = document.getElementById('panelOrderType') ? document.getElementById('panelOrderType').value : 'new';
    let userVal = '';
    
    if (orderType === 'new') {
        userVal = document.getElementById('panelUser').value;
    } else {
        userVal = document.getElementById('existingPanelUser').value;
    }

    const btn = document.getElementById('btnBuy');
    const isValidUser = /^[a-zA-Z0-9-]{3,}$/.test(userVal);
    const eggSelEl = document.getElementById('panelEgg');
    const eggOk = !eggSelEl || !eggSelEl.options.length || eggSelEl.options[0].dataset.empty === '1' || !!eggSelEl.value;
    if (isValidUser && selectedProductCode && eggOk) {
        btn.classList.add('active');
        document.getElementById('footerAlert').style.display = 'none';
        document.getElementById('footerPrice').innerText = 'Rp ' + selectedPrice.toLocaleString();
        btn.disabled = false;
    } else {
        btn.classList.remove('active');
        let msg = "Lengkapi form.";
        if (!isValidUser && userVal.length > 0) msg = "Username min 3 karakter (Huruf/Angka/-)";
        document.getElementById('footerAlert').innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        document.getElementById('footerAlert').style.display = 'flex';
        document.getElementById('footerPrice').innerText = 'Rp 0';
        btn.disabled = true;
    }
}

// --- UBAH AKSI KLIK TOMBOL PERPANJANG ---
document.getElementById('btnExtend')?.addEventListener('click', async () => {
    const orderType = document.getElementById('panelOrderType') ? document.getElementById('panelOrderType').value : 'new';
    const username_panel = orderType === 'new' ? document.getElementById('panelUser').value : document.getElementById('existingPanelUser').value;
    const server_id = document.getElementById('panelServerId') ? document.getElementById('panelServerId').value : ''; // TAMBAHAN ID
    
    if (!username_panel || username_panel.length < 3) {
        return Swal.fire({
            icon: 'warning',
            title: 'Isi Username Dulu!',
            text: 'Masukkan Username Panel yang ingin kamu perpanjang di kolom Langkah 1.'
        });
    }

    // FIX: TAMBAHAN VALIDASI ID SERVER WAJIB DIISI
    if (!server_id || server_id.trim() === '') {
        return Swal.fire({
            icon: 'warning',
            title: 'ID Server Kosong!',
            text: 'Silakan masukkan ID Server panel yang ingin kamu perpanjang.'
        });
    }

    if (!selectedProductCode) {
        return Swal.fire({
            icon: 'warning',
            title: 'Pilih Paket RAM!',
            text: 'Silakan pilih Paket RAM yang SESUAI dengan panel kamu di Langkah 2.'
        });
    }

    const { token } = checkLogin();
    if (!token) return window.location.href = '/login';

    if (selectedMethod !== 'saldo') {
        return Swal.fire('Peringatan', 'Perpanjang panel HANYA bisa menggunakan Saldo Akun. Pilih Saldo di Langkah 3.', 'info');
    }

    Swal.fire({
        title: 'Mengecek Data Panel...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const res = await fetch('/api/extend-panel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, username_panel, server_id: server_id, product_code: selectedProductCode }) // KIRIM ID KE BACKEND
        });
        const data = await res.json();

        if (data.success) {
            Swal.close(); // Tutup loading puter-puter
            Swal.fire({
                icon: 'success',
                title: 'Sukses!',
                text: 'Perpanjangan berhasil.',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 1500
            });
            // LANGSUNG BUKA POPUP PANEL TANPA RELOAD!
            loadUserData();
            const btnPanel = document.getElementById('menuPanelPopup');
            if (btnPanel) btnPanel.click();
        }
 else {
            if (data.need_deposit) {
                Swal.fire({
                    title: 'Saldo Kurang',
                    text: 'Saldo kamu tidak cukup untuk perpanjang. Deposit sekarang?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Ya, Deposit',
                    cancelButtonText: 'Batal'
                }).then((res) => {
                    if (res.isConfirmed) {
                        window.location.href = '/deposit';
                    }
                });
            } else {
                Swal.fire('Gagal Perpanjang', data.message, 'error');
            }
        }
    } catch (e) {
        Swal.fire('Error', 'Gagal terhubung ke server.', 'error');
    }
});

function openModalConfirm() {
    const user = document.getElementById('panelUser').value;
    const prod = products.find(p => p.code === selectedProductCode);
    const eggSel = document.getElementById('panelEgg');
    const eggTxt = eggSel && eggSel.value ? eggSel.options[eggSel.selectedIndex].text : '';
    document.getElementById('c-prod').innerText = prod ? (prod.name + (eggTxt ? ' | Egg: ' + eggTxt : '')) : '-';
    document.getElementById('c-user').innerText = user;
    document.getElementById('c-method').innerText = selectedMethod.toUpperCase();
    const finalPnlPrice = getFinalPriceByPage('panel');
    document.getElementById('c-total').innerText = 'Rp ' + finalPnlPrice.toLocaleString();
    fillBuyerInfoForModal('confirmModalOverlay');
    confirmModal.classList.add('show');
}

// ============ SCRIPT ============
async function fetchScripts() {
    try {
        const res = await fetch('/api/scripts');
        const json = await res.json();
        if (json.success) {
            scripts = json.data;
            renderScripts();
        }
    } catch (e) {
        console.log("Gagal ambil script");
    }
}

function renderScripts() {
    const grid = document.getElementById('scriptGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!scripts || scripts.length === 0) { grid.innerHTML = stockEmptyHtml('Script'); return; }

    scripts.forEach(s => {
        const isHabis = (s.active === false);
        const card = document.createElement('div');
        card.className = `prod-card ${isHabis ? 'disabled' : ''}`;
        if (!isHabis) card.addEventListener('click', () => selectScriptItem(card, s));

        const badge = isHabis ?
            `<div class="badge-habis">STOK KOSONG</div>` :
            `<div class="badge-ready">READY</div>`;

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-code" style="font-size:28px; color:${isHabis ? '#bdc3c7' : '#f1c40f'}; margin-bottom:8px;"></i>
                <span class="prod-name" style="font-size:13px; margin-bottom:2px;">${s.name}</span>
                <span style="font-size:10px; color:#666;">Full Source Code</span>
                ${badge}
                <span class="prod-price">Rp ${s.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectScriptItem(el, scriptData) {
    document.querySelectorAll('#scriptGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedScriptCode = scriptData.code;
    selectedScriptPrice = scriptData.price;
    selectedScriptData = scriptData;
    checkOrderScript();
    resetPromo('script');
    
    autoScrollToNextStepByPage('script', 1);
}

function selectPayMethodScript(method) {
    selectedMethodScript = method;
    const nameElScript = document.getElementById('metodeNameScript');
    if (nameElScript) nameElScript.innerText = getMetodeLabel(method);
    const rincianNameElScript = document.getElementById('rincianMetodeNameScript');
    if (rincianNameElScript) rincianNameElScript.innerText = getMetodeLabel(method);
    checkOrderScript();
}

function checkOrderScript() {
    const btn = document.getElementById('btnBuyScript');

    if (selectedScriptCode && selectedMethodScript) {
        btn.classList.add('active');
        document.getElementById('footerAlertScript').style.display = 'none';
        document.getElementById('footerPriceScript').innerText = 'Rp ' + selectedScriptPrice.toLocaleString();
        btn.disabled = false;
    } else {
        btn.classList.remove('active');
        let msg = "Pilih script & metode pembayaran.";
        document.getElementById('footerAlertScript').innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        document.getElementById('footerAlertScript').style.display = 'flex';
        document.getElementById('footerPriceScript').innerText = 'Rp 0';
        btn.disabled = true;
    }
}

// ============ MURID ============
async function fetchMurid() {
    try {
        const res = await fetch('/api/murid');
        const json = await res.json();
        if (json.success) {
            muridPackages = json.data;
            renderMurid();
        }
    } catch (e) {
        console.log("Gagal ambil data murid");
    }
}

function renderMurid() {
    const grid = document.getElementById('muridGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!muridPackages || muridPackages.length === 0) { grid.innerHTML = stockEmptyHtml('Kelas Murid'); return; }

    muridPackages.forEach(m => {
        const isHabis = (m.active === false);
        const card = document.createElement('div');
        card.className = `prod-card ${isHabis ? 'disabled' : ''}`;
        if (!isHabis) card.addEventListener('click', () => selectMuridItem(card, m));

        const badge = isHabis ?
            `<div class="badge-habis">DITUTUP</div>` :
            `<div class="badge-ready">DIBUKA</div>`;

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-graduation-cap" style="font-size:28px; color:${isHabis ? '#bdc3c7' : '#9b59b6'}; margin-bottom:8px;"></i>
                <span class="prod-name" style="font-size:13px; margin-bottom:2px;">${m.name}</span>
                ${badge}
                <span class="prod-price">Rp ${m.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectMuridItem(el, data) {
    document.querySelectorAll('#muridGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedMuridCode = data.code;
    selectedMuridPrice = data.price;
    selectedMuridData = data;
    checkOrderMurid();
    resetPromo('murid');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('murid', 1);
}

function selectPayMethodMurid(method) {
    selectedMethodMurid = method;
    const nameElMurid = document.getElementById('metodeNameMurid');
    if (nameElMurid) nameElMurid.innerText = getMetodeLabel(method);
    const rincianNameElMurid = document.getElementById('rincianMetodeNameMurid');
    if (rincianNameElMurid) rincianNameElMurid.innerText = getMetodeLabel(method);
    checkOrderMurid();
}

function checkOrderMurid() {
    const btn = document.getElementById('btnBuyMurid');

    if (selectedMuridCode && selectedMethodMurid) {
        btn.classList.add('active');
        document.getElementById('footerAlertMurid').style.display = 'none';
        document.getElementById('footerPriceMurid').innerText = 'Rp ' + selectedMuridPrice.toLocaleString();
        btn.disabled = false;
    } else {
        btn.classList.remove('active');
        let msg = "Pilih paket & pembayaran.";
        document.getElementById('footerAlertMurid').innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        document.getElementById('footerAlertMurid').style.display = 'flex';
        document.getElementById('footerPriceMurid').innerText = 'Rp 0';
        btn.disabled = true;
    }
}

// ============ VPS ============
async function fetchVPS() {
    try {
        const res = await fetch('/api/vps');
        const json = await res.json();
        if (json.success) {
            vpsList = json.data;
            renderVPS();
        }
    } catch (e) { }
}

function renderVPS() {
    const grid = document.getElementById('vpsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!vpsList || vpsList.length === 0) { grid.innerHTML = stockEmptyHtml('VPS'); return; }

    vpsList.forEach(v => {
        const isHabis = (v.active === false);
        const card = document.createElement('div');
        card.className = `prod-card ${isHabis ? 'disabled' : ''}`;
        if (!isHabis) card.addEventListener('click', () => selectVPSItem(card, v));

        const badge = isHabis ?
            `<div class="badge-habis">STOK KOSONG</div>` :
            `<div class="badge-ready">AVAILABLE</div>`;

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-cloud" style="font-size:28px; color:${isHabis ? '#bdc3c7' : '#8e44ad'}; margin-bottom:8px;"></i>
                <span class="prod-name" style="font-size:13px; margin-bottom:2px;">${v.name}</span>
                <span style="font-size:10px; color:#666;">${v.spec || 'High Performance'}</span>
                ${badge}
                <span class="prod-price">Rp ${v.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectVPSItem(el, data) {
    document.querySelectorAll('#vpsGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedVPSCode = data.code;
    selectedVPSPrice = data.price;
    selectedVPSData = data;
    checkOrderVPS();
    resetPromo('vps');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('vps', 1);
}

function selectPayMethodVPS(method) {
    selectedMethodVPS = method;
    const nameElVPS = document.getElementById('metodeNameVPS');
    if (nameElVPS) nameElVPS.innerText = getMetodeLabel(method);
    const rincianNameElVPS = document.getElementById('rincianMetodeNameVPS');
    if (rincianNameElVPS) rincianNameElVPS.innerText = getMetodeLabel(method);
    checkOrderVPS();
}

function checkOrderVPS() {
    const btn = document.getElementById('btnBuyVPS');
    if (selectedVPSCode && selectedMethodVPS) {
        btn.classList.add('active');
        document.getElementById('footerAlertVPS').style.display = 'none';
        document.getElementById('footerPriceVPS').innerText = 'Rp ' + selectedVPSPrice.toLocaleString();
        btn.disabled = false;
    } else {
        btn.classList.remove('active');
        document.getElementById('footerAlertVPS').style.display = 'flex';
        document.getElementById('footerPriceVPS').innerText = 'Rp 0';
        btn.disabled = true;
    }
}

// ============ SOSMED ============
async function fetchSosmedServices() {
    const catSelect = document.getElementById('sosmedCategory');
    if (catSelect) catSelect.innerHTML = '<option>Memuat data...</option>';

    try {
        const res = await fetch('/api/sosmed/services');
        const json = await res.json();

        if (json.success) {
            sosmedServices = json.data;
            if (json.pricing) sosmedPricing = { flat: Number(json.pricing.flat) || 0, min_order: Number(json.pricing.min_order) || 0 };
            const cats = [...new Set(sosmedServices.map(item => item.category))];
            sosmedCategories = cats.sort();
            renderSosmedCategories();
        } else {
            const modalSmm = document.getElementById('modalSosmed');
            if (modalSmm) {
                modalSmm.style.display = 'none';
                modalSmm.classList.remove('show');
            }
            Swal.fire({
                icon: 'info',
                title: 'Stok Kosong',
                text: json.message || 'Layanan Sosmed sedang kosong. Silakan cek lagi nanti ya.',
                confirmButtonColor: '#e74c3c'
            });
        }
    } catch (e) {
        console.log("Error sosmed fetch", e);
    }
}

function renderSosmedCategories() {
    const catSelect = document.getElementById('sosmedCategory');
    catSelect.innerHTML = '<option value="">-- Pilih Kategori --</option>';

    sosmedCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        catSelect.appendChild(opt);
    });
}

function renderSosmedServices(category) {
    const servSelect = document.getElementById('sosmedService');
    servSelect.innerHTML = '<option value="">-- Pilih Layanan --</option>';

    const filtered = sosmedServices.filter(s => s.category === category);
    filtered.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.innerText = `${s.name} (Rp ${s.price.toLocaleString()}/k)`;
        servSelect.appendChild(opt);
    });
}

function calculateSosmedPrice() {
    const qty = parseInt(document.getElementById('sosmedQty').value) || 0;
    const priceDisplay = document.getElementById('sosmedTotalPrice');
    const footerPrice = document.getElementById('footerPriceSosmed');
    const btn = document.getElementById('btnBuySosmed');
    const alert = document.getElementById('footerAlertSosmed');

    if (selectedSosmedService && qty > 0) {
        const pricePer1000 = selectedSosmedService.price;
        const total = Math.ceil((pricePer1000 / 1000) * qty) + sosmedPricing.flat;

        priceDisplay.innerText = 'Rp ' + total.toLocaleString();
        footerPrice.innerText = 'Rp ' + total.toLocaleString();

        if (qty < selectedSosmedService.min || qty > selectedSosmedService.max) {
            btn.classList.remove('active');
            btn.disabled = true;
            alert.style.display = 'flex';
            alert.innerHTML = `<i class="fas fa-exclamation-circle"></i> Min: ${selectedSosmedService.min}, Max: ${selectedSosmedService.max}`;
        } else if (total < sosmedPricing.min_order) {
            btn.classList.remove('active');
            btn.disabled = true;
            alert.style.display = 'flex';
            alert.innerHTML = `<i class="fas fa-exclamation-circle"></i> Minimal order Rp ${sosmedPricing.min_order.toLocaleString('id-ID')}. Tambah jumlahnya ya.`;
        } else if (!selectedMethodSosmed) {
            btn.classList.remove('active');
            btn.disabled = true;
            alert.style.display = 'flex';
            alert.innerHTML = `<i class="fas fa-info-circle"></i> Pilih pembayaran.`;
        } else {
            btn.classList.add('active');
            btn.disabled = false;
            alert.style.display = 'none';
        }
    } else {
        priceDisplay.innerText = 'Rp 0';
        footerPrice.innerText = 'Rp 0';
        btn.classList.remove('active');
        btn.disabled = true;
    }
}

function selectPayMethodSosmed(method) {
    selectedMethodSosmed = method;
    const nameElSosmed = document.getElementById('metodeNameSosmed');
    if (nameElSosmed) nameElSosmed.innerText = getMetodeLabel(method);
    const rincianNameElSosmed = document.getElementById('rincianMetodeNameSosmed');
    if (rincianNameElSosmed) rincianNameElSosmed.innerText = getMetodeLabel(method);
    calculateSosmedPrice();
    resetPromo('sosmed');
    
    // Scroll ke tombol beli
    setTimeout(() => scrollToBuyButton('sosmed'), 100);
}

// ============ SUBDOMAIN ============
async function fetchCFZones() {
    const grid = document.getElementById('domainGrid');
    const loading = document.getElementById('domainListLoading');
    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const res = await fetch('/api/cf-zones');
        const json = await res.json();
        loading.style.display = 'none';

        if (json.success && json.data.length > 0) {
            cfZones = json.data;
            cfZones.forEach(z => {
                const card = document.createElement('div');
                card.className = 'prod-card';
                card.onclick = () => selectZoneItem(card, z);

                card.innerHTML = `
                    <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                        <i class="fas fa-globe" style="font-size:24px; color:#2980b9; margin-bottom:5px;"></i>
                        <span class="prod-name" style="font-size:12px;">${z.name}</span>
                        <span class="prod-price">Rp ${z.price.toLocaleString()}</span>
                    </div>
                `;
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load domain / Kosong.</div>';
        }
    } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
    }
}

function selectZoneItem(el, data) {
    document.querySelectorAll('#domainGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedZone = data;
    checkOrderSub();
    resetPromo('subdomain');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('subdomain', 1);
}

function selectPayMethodSub(method) {
    selectedMethodSub = method;
    const nameElSub = document.getElementById('metodeNameSub');
    if (nameElSub) nameElSub.innerText = getMetodeLabel(method);
    const rincianNameElSub = document.getElementById('rincianMetodeNameSub');
    if (rincianNameElSub) rincianNameElSub.innerText = getMetodeLabel(method);
    checkOrderSub();
    
    // Scroll ke tombol beli
    setTimeout(() => scrollToBuyButton('subdomain'), 100);
}

function checkOrderSub() {
    const btn = document.getElementById('btnBuySub');
    const sub = document.getElementById('subdomainName').value;
    const ip = document.getElementById('subdomainIP').value;

    const isSubValid = /^[a-z0-9]+$/.test(sub);
    const isIpValid = ip.length > 6;

    if (isSubValid && isIpValid && selectedZone && selectedMethodSub) {
        btn.classList.add('active');
        document.getElementById('footerAlertSub').style.display = 'none';
        document.getElementById('footerPriceSub').innerText = 'Rp ' + selectedZone.price.toLocaleString();
        btn.disabled = false;
    } else {
        btn.classList.remove('active');
        let msg = "Lengkapi data.";
        if (!isSubValid && sub.length > 0) msg = "Nama subdomain huruf kecil & angka saja.";
        else if (!selectedZone) msg = "Pilih domain utama.";
        else if (!selectedMethodSub) msg = "Pilih pembayaran.";

        document.getElementById('footerAlertSub').innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        document.getElementById('footerAlertSub').style.display = 'flex';
        document.getElementById('footerPriceSub').innerText = 'Rp 0';
        btn.disabled = true;
    }
}

// ============ GAME FREE FIRE ============

async function fetchGameProductsFF() {
    const gridDiamond = document.getElementById('gameProductGridDiamond');
    const gridMembership = document.getElementById('gameProductGridMembership');
    const loadingDiamond = document.getElementById('gameProductLoading');
    const loadingMembership = document.getElementById('gameMembershipLoading');
    
    if (!gridDiamond) return;

    if (loadingDiamond) loadingDiamond.style.display = 'block';
    if (loadingMembership) loadingMembership.style.display = 'block';
    gridDiamond.innerHTML = '';
    if (gridMembership) gridMembership.innerHTML = '';

    try {
        const res = await fetch('/api/game/products/ff');
        const json = await res.json();

        if (loadingDiamond) loadingDiamond.style.display = 'none';
        if (loadingMembership) loadingMembership.style.display = 'none';

        if (json.success && json.data) {
            gameProducts = json.data.diamond || [];
            membershipProducts = json.data.membership || [];
            renderGameProducts();
            renderMembershipProducts();
        } else {
            gridDiamond.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk diamond.</div>';
            if (gridMembership) {
                gridMembership.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk membership.</div>';
            }
        }
    } catch (e) {
        if (loadingDiamond) loadingDiamond.style.display = 'none';
        if (loadingMembership) loadingMembership.style.display = 'none';
        gridDiamond.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
        if (gridMembership) {
            gridMembership.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
        }
    }
}

function renderGameProducts() {
    const grid = document.getElementById('gameProductGridDiamond');
    if (!grid) return;
    grid.innerHTML = '';

    gameProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectProductGame(card, p);

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-gem" style="font-size:24px; color:#ff6b6b; margin-bottom:5px;"></i>
                <span class="prod-name" style="font-size:12px;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderMembershipProducts() {
    const grid = document.getElementById('gameProductGridMembership');
    if (!grid) return;
    grid.innerHTML = '';

    membershipProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectMembershipProduct(card, p);

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-crown" style="font-size:24px; color:#f1c40f; margin-bottom:5px;"></i>
                <span class="prod-name" style="font-size:11px; text-align:center;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectProductGame(el, data) {
    document.querySelectorAll('#gameProductGridDiamond .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedGameCode = data.code;
    selectedGamePrice = data.price;
    selectedGameData = data;
    // Reset membership selection
    selectedMembershipCode = null;
    selectedMembershipPrice = 0;
    selectedMembershipData = null;
    document.querySelectorAll('#gameProductGridMembership .prod-card').forEach(c => c.classList.remove('selected'));
    checkOrderGame();
    resetPromo('game');
    
    autoScrollToNextStepByPage('game-ff', 1);
}

function selectMembershipProduct(el, data) {
    document.querySelectorAll('#gameProductGridMembership .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedMembershipCode = data.code;
    selectedMembershipPrice = data.price;
    selectedMembershipData = data;
    // Reset diamond selection
    selectedGameCode = null;
    selectedGamePrice = 0;
    selectedGameData = null;
    document.querySelectorAll('#gameProductGridDiamond .prod-card').forEach(c => c.classList.remove('selected'));
    checkOrderGame();
    resetPromo('game');
    
    autoScrollToNextStepByPage('game-ff', 1);
}

function switchGameTab(tab) {
    const diamondPanel = document.getElementById('gameDiamondPanel');
    const membershipPanel = document.getElementById('gameMembershipPanel');
    const diamondBtn = document.getElementById('tabDiamondBtn');
    const membershipBtn = document.getElementById('tabMembershipBtn');
    
    if (tab === 'diamond') {
        diamondPanel.style.display = 'block';
        membershipPanel.style.display = 'none';
        diamondBtn.classList.add('active');
        membershipBtn.classList.remove('active');
    } else {
        diamondPanel.style.display = 'none';
        membershipPanel.style.display = 'block';
        diamondBtn.classList.remove('active');
        membershipBtn.classList.add('active');
    }
}

function checkGameInput() {
    checkOrderGame();
}

function resetGameInputs() {
    document.getElementById('gameUserId').value = '';
    selectedGameCode = null;
    selectedGamePrice = 0;
    selectedGameData = null;
    selectedMembershipCode = null;
    selectedMembershipPrice = 0;
    selectedMembershipData = null;
    selectedMethodGame = 'saldo'; // default, satu-satunya metode saat ini
    resetPromo('game');
    checkOrderGame();
    
    // Reset tab ke Diamond
    const diamondPanel = document.getElementById('gameDiamondPanel');
    const membershipPanel = document.getElementById('gameMembershipPanel');
    const diamondBtn = document.getElementById('tabDiamondBtn');
    const membershipBtn = document.getElementById('tabMembershipBtn');
    if (diamondPanel) diamondPanel.style.display = 'block';
    if (membershipPanel) membershipPanel.style.display = 'none';
    if (diamondBtn) diamondBtn.classList.add('active');
    if (membershipBtn) membershipBtn.classList.remove('active');
}

function getMetodeLabel(key) {
    const labels = { saldo: 'Saldo Akun' };
    return labels[key] || key;
}

function selectPayMethodGame(method) {
    selectedMethodGame = method;
    const nameEl = document.getElementById('metodeNameGame');
    if (nameEl) nameEl.innerText = getMetodeLabel(method);
    checkOrderGame();
}

function checkOrderGame() {
    const btn = document.getElementById('btnBuyGame');
    const footerPrice = document.getElementById('footerPriceGame');
    const alert = document.getElementById('footerAlertGame');

    const userId = document.getElementById('gameUserId') ? document.getElementById('gameUserId').value.trim() : '';
    const hasId = userId.length >= 5;

    const hasProduct = (selectedGameCode && selectedGamePrice) || (selectedMembershipCode && selectedMembershipPrice);
    const finalPrice = selectedGamePrice || selectedMembershipPrice || 0;

    if (hasId && hasProduct && selectedMethodGame) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
        footerPrice.innerText = 'Rp ' + finalPrice.toLocaleString();
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';

        let msg = "Lengkapi data.";
        if (!hasId) msg = "Masukkan User ID dengan benar.";
        else if (!hasProduct) msg = "Pilih nominal diamond atau membership.";
        else if (!selectedMethodGame) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        footerPrice.innerText = 'Rp 0';
    }
}

// ============ GAME MOBILE LEGENDS (ML) ============
// Sama persis polanya kayak FF, cuma gak ada cek nickname.
// Validasi ID murni dari 2 input (User ID + Zone ID) + peringatan di UI.

async function fetchGameProductsML() {
    const gridDiamond = document.getElementById('gameProductGridDiamondML');
    const gridMembership = document.getElementById('gameProductGridMembershipML');
    const loadingDiamond = document.getElementById('gameProductLoadingML');
    const loadingMembership = document.getElementById('gameMembershipLoadingML');

    if (!gridDiamond) return;

    if (loadingDiamond) loadingDiamond.style.display = 'block';
    if (loadingMembership) loadingMembership.style.display = 'block';
    gridDiamond.innerHTML = '';
    if (gridMembership) gridMembership.innerHTML = '';

    try {
        const res = await fetch('/api/game/products/ml');
        const json = await res.json();

        if (loadingDiamond) loadingDiamond.style.display = 'none';
        if (loadingMembership) loadingMembership.style.display = 'none';

        if (json.success && json.data) {
            mlGameProducts = json.data.diamond || [];
            mlMembershipProducts = json.data.membership || [];
            renderGameProductsML();
            renderMembershipProductsML();
        } else {
            gridDiamond.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk diamond.</div>';
            if (gridMembership) {
                gridMembership.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk membership.</div>';
            }
        }
    } catch (e) {
        if (loadingDiamond) loadingDiamond.style.display = 'none';
        if (loadingMembership) loadingMembership.style.display = 'none';
        gridDiamond.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
        if (gridMembership) {
            gridMembership.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
        }
    }
}

function renderGameProductsML() {
    const grid = document.getElementById('gameProductGridDiamondML');
    if (!grid) return;
    grid.innerHTML = '';

    mlGameProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectProductML(card, p);

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-gem" style="font-size:24px; color:#3fa9f5; margin-bottom:5px;"></i>
                <span class="prod-name" style="font-size:12px;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderMembershipProductsML() {
    const grid = document.getElementById('gameProductGridMembershipML');
    if (!grid) return;
    grid.innerHTML = '';

    mlMembershipProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectMembershipProductML(card, p);

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-crown" style="font-size:24px; color:#f1c40f; margin-bottom:5px;"></i>
                <span class="prod-name" style="font-size:11px; text-align:center;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectProductML(el, data) {
    document.querySelectorAll('#gameProductGridDiamondML .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedMLCode = data.code;
    selectedMLPrice = data.price;
    selectedMLData = data;
    // Reset membership selection
    selectedMLMembershipCode = null;
    selectedMLMembershipPrice = 0;
    selectedMLMembershipData = null;
    document.querySelectorAll('#gameProductGridMembershipML .prod-card').forEach(c => c.classList.remove('selected'));
    checkOrderML();
    resetPromo('game-ml');

    autoScrollToNextStepByPage('game-ml', 1);
}

function selectMembershipProductML(el, data) {
    document.querySelectorAll('#gameProductGridMembershipML .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedMLMembershipCode = data.code;
    selectedMLMembershipPrice = data.price;
    selectedMLMembershipData = data;
    // Reset diamond selection
    selectedMLCode = null;
    selectedMLPrice = 0;
    selectedMLData = null;
    document.querySelectorAll('#gameProductGridDiamondML .prod-card').forEach(c => c.classList.remove('selected'));
    checkOrderML();
    resetPromo('game-ml');

    autoScrollToNextStepByPage('game-ml', 1);
}

function switchGameTabML(tab) {
    const diamondPanel = document.getElementById('gameDiamondPanelML');
    const membershipPanel = document.getElementById('gameMembershipPanelML');
    const diamondBtn = document.getElementById('tabDiamondBtnML');
    const membershipBtn = document.getElementById('tabMembershipBtnML');

    if (tab === 'diamond') {
        diamondPanel.style.display = 'block';
        membershipPanel.style.display = 'none';
        diamondBtn.classList.add('active');
        membershipBtn.classList.remove('active');
    } else {
        diamondPanel.style.display = 'none';
        membershipPanel.style.display = 'block';
        diamondBtn.classList.remove('active');
        membershipBtn.classList.add('active');
    }
}

function resetMLInputs() {
    if (document.getElementById('mlUserId')) document.getElementById('mlUserId').value = '';
    if (document.getElementById('mlZoneId')) document.getElementById('mlZoneId').value = '';
    selectedMLCode = null;
    selectedMLPrice = 0;
    selectedMLData = null;
    selectedMLMembershipCode = null;
    selectedMLMembershipPrice = 0;
    selectedMLMembershipData = null;
    selectedMethodML = 'saldo'; // default, satu-satunya metode saat ini
    resetPromo('game-ml');
    checkOrderML();

    // Reset tab ke Diamond
    const diamondPanel = document.getElementById('gameDiamondPanelML');
    const membershipPanel = document.getElementById('gameMembershipPanelML');
    const diamondBtn = document.getElementById('tabDiamondBtnML');
    const membershipBtn = document.getElementById('tabMembershipBtnML');
    if (diamondPanel) diamondPanel.style.display = 'block';
    if (membershipPanel) membershipPanel.style.display = 'none';
    if (diamondBtn) diamondBtn.classList.add('active');
    if (membershipBtn) membershipBtn.classList.remove('active');
}

function selectPayMethodML(method) {
    selectedMethodML = method;
    const nameEl = document.getElementById('metodeNameGameML');
    if (nameEl) nameEl.innerText = getMetodeLabel(method);
    checkOrderML();
}

function checkOrderML() {
    const btn = document.getElementById('btnBuyGameML');
    const footerPrice = document.getElementById('footerPriceGameML');
    const alert = document.getElementById('footerAlertGameML');
    if (!btn) return;

    const userId = document.getElementById('mlUserId') ? document.getElementById('mlUserId').value.trim() : '';
    const zoneId = document.getElementById('mlZoneId') ? document.getElementById('mlZoneId').value.trim() : '';
    const hasId = userId.length >= 4 && zoneId.length >= 3;

    const hasProduct = (selectedMLCode && selectedMLPrice) || (selectedMLMembershipCode && selectedMLMembershipPrice);
    const finalPrice = selectedMLPrice || selectedMLMembershipPrice || 0;

    if (hasId && hasProduct && selectedMethodML) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
        footerPrice.innerText = 'Rp ' + finalPrice.toLocaleString();
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';

        let msg = "Lengkapi data.";
        if (!hasId) msg = "Masukkan User ID & Zone ID dengan benar.";
        else if (!hasProduct) msg = "Pilih nominal diamond atau membership.";
        else if (!selectedMethodML) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        footerPrice.innerText = 'Rp 0';
    }
}

// ============ POPUP METODE PEMBAYARAN (GENERIC, DIPAKE SEMUA HALAMAN) ============
let metodePopupContext = null;
let metodePopupPending = null;

function openMetodePopup(context) {
    // context: { options: [{key, name, icon, sub}], current, onSelect: fn }
    metodePopupContext = context;
    metodePopupPending = context.current || (context.options[0] && context.options[0].key);
    renderMetodePopupList();
    document.getElementById('metodePopupOverlay').classList.add('show');
}

function renderMetodePopupList() {
    const list = document.getElementById('metodePopupList');
    if (!list || !metodePopupContext) return;
    list.innerHTML = '';

    metodePopupContext.options.forEach(opt => {
        const row = document.createElement('div');
        row.className = 'metode-option-row' + (opt.key === metodePopupPending ? ' active' : '');
        row.innerHTML = `
            <div class="metode-left">
                <div class="metode-icon"><i class="fas ${opt.icon || 'fa-wallet'}"></i></div>
                <div>
                    <div class="metode-name">${opt.name}</div>
                    ${opt.sub ? `<div class="metode-sub">${opt.sub}</div>` : ''}
                </div>
            </div>
            <div class="metode-radio"></div>
        `;
        row.onclick = () => {
            metodePopupPending = opt.key;
            renderMetodePopupList();
        };
        list.appendChild(row);
    });
}

function closeMetodePopup() {
    document.getElementById('metodePopupOverlay').classList.remove('show');
}

// ============ E-WALLET DANA ============
async function fetchEwalletProductsDANA() {
    const grid = document.getElementById('ewalletProductGrid');
    const loading = document.getElementById('ewalletProductLoading');
    if (!grid || !loading) return;

    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const res = await fetch('/api/ewallet/products/dana');
        const json = await res.json();

        loading.style.display = 'none';

        if (json.success && json.data.length > 0) {
            ewalletProducts = json.data;
            renderEwalletProducts();
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk / Kosong.</div>';
        }
    } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
    }
}

function renderEwalletProducts() {
    const grid = document.getElementById('ewalletProductGrid');
    grid.innerHTML = '';

    ewalletProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectProductEwallet(card, p);

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-money-bill-wave" style="font-size:24px; line-height:30px; height:30px; margin-bottom:5px; color:var(--primary-color);"></i>
                <span class="prod-name" style="font-size:12px;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectProductEwallet(el, data) {
    document.querySelectorAll('#ewalletProductGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedEwalletCode = data.code;
    selectedEwalletPrice = data.price;
    selectedEwalletData = data;
    checkOrderEwallet();
    resetPromo('ewallet');
    
    autoScrollToNextStepByPage('ewallet-dana', 1);
}

// =========================================================
// 2. FUNGSI UTAMA CEK NAMA SEMUA E-WALLET
// =========================================================
async function checkEwalletNumberGlobal(type) {
    const config = {
        'DANA': { phoneId: 'ewalletPhone', btnId: 'btnCheckEwallet', nameId: 'ewalletName', statusId: 'ewalletStatus', infoId: 'ewalletUserInfo', checkOrderFn: 'checkOrderEwallet', bankCode: 'dana', setUser: (user) => checkedEwalletUser = user },
        'GOPAY_DRIVER': { phoneId: 'ewalletPhoneGD', btnId: 'btnCheckEwalletGD', nameId: 'ewalletNameGD', statusId: 'ewalletStatusGD', infoId: 'ewalletUserInfoGD', checkOrderFn: 'checkOrderEwalletGD', bankCode: 'gopay', setUser: (user) => checkedEwalletUserGD = user },
        'GOPAY': { phoneId: 'ewalletPhoneGopay', btnId: 'btnCheckEwalletGopay', nameId: 'ewalletNameGopay', statusId: 'ewalletStatusGopay', infoId: 'ewalletUserInfoGopay', checkOrderFn: 'checkOrderEwalletGopay', bankCode: 'gopay', setUser: (user) => checkedEwalletUserGopay = user },
        'OVO': { phoneId: 'ovoPhone', btnId: 'btnCheckOvo', nameId: 'ovoName', statusId: 'ovoStatus', infoId: 'ovoUserInfo', checkOrderFn: 'checkOrderOvo', bankCode: 'ovo', setUser: (user) => checkedOvoUser = user },
        'SHOPEEPAY': { phoneId: 'shopeePhone', btnId: 'btnCheckShopee', nameId: 'shopeeName', statusId: 'shopeeStatus', infoId: 'shopeeUserInfo', checkOrderFn: 'checkOrderShopee', bankCode: 'shopeepay', setUser: (user) => checkedShopeeUser = user },
        'LINKAJA': { phoneId: 'linkajaPhone', btnId: 'btnCheckLinkaja', nameId: 'linkajaName', statusId: 'linkajaStatus', infoId: 'linkajaUserInfo', checkOrderFn: 'checkOrderLinkaja', bankCode: 'linkaja', setUser: (user) => checkedLinkajaUser = user },
        'ASTRAPAY': { phoneId: 'astrapayPhone', btnId: 'btnCheckAstrapay', nameId: 'astrapayName', statusId: 'astrapayStatus', infoId: 'astrapayUserInfo', checkOrderFn: 'checkOrderAstrapay', bankCode: 'astrapay', setUser: (user) => checkedAstrapayUser = user },
        'ISAKU': { phoneId: 'isakuPhone', btnId: 'btnCheckIsaku', nameId: 'isakuName', statusId: 'isakuStatus', infoId: 'isakuUserInfo', checkOrderFn: 'checkOrderIsaku', bankCode: 'isaku', setUser: (user) => checkedIsakuUser = user },
        'KASPRO': { phoneId: 'kasproPhone', btnId: 'btnCheckKaspro', nameId: 'kasproName', statusId: 'kasproStatus', infoId: 'kasproUserInfo', checkOrderFn: 'checkOrderKaspro', bankCode: 'kaspro', setUser: (user) => checkedKasproUser = user }
    };

    const cfg = config[type];
    if (!cfg) return;

    const phoneInput = document.getElementById(cfg.phoneId);
    if (!phoneInput) return;
    
    let cleanNumber = phoneInput.value.replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('0')) cleanNumber = '62' + cleanNumber.substring(1);
    
    if (cleanNumber.length < 10) {
        Swal.fire('Error', 'Nomor tidak valid! Minimal 10 digit.', 'warning');
        return;
    }

    const btn = document.getElementById(cfg.btnId);
    const originalBtnText = btn ? btn.innerHTML : 'CEK NOMOR';
    
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengecek...';
        btn.disabled = true;
    }

    // Set timeout 7 detik
    const timeoutId = setTimeout(() => {
        if (btn && btn.disabled) {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
            
            const fallbackName = `User ${type} (${cleanNumber.slice(-4)})`;
            cfg.setUser({ name: fallbackName, number: cleanNumber });
            const nameElement = document.getElementById(cfg.nameId);
            if (nameElement) nameElement.innerHTML = `<span style="color: #f39c12;">${fallbackName}</span>`;
            const statusElement = document.getElementById(cfg.statusId);
            if (statusElement) statusElement.innerText = 'Timeout, Lanjutkan';
            const infoElement = document.getElementById(cfg.infoId);
            if (infoElement) infoElement.style.display = 'flex';
            Swal.fire('Info', 'Cek nama timeout, pastikan nomor sudah benar!', 'warning');
            
            if(typeof window[cfg.checkOrderFn] === 'function') window[cfg.checkOrderFn]();
        }
    }, 7000);

    try {
        const res = await fetch(`/api/ewallet/check/${cfg.bankCode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_number: cleanNumber })
        });
        
        clearTimeout(timeoutId);
        
        const data = await res.json();

        if (data.success && data.data && data.data.name) {
            cfg.setUser({ name: data.data.name, number: cleanNumber });
            const nameElement = document.getElementById(cfg.nameId);
            if (nameElement) nameElement.innerHTML = escapeHtml(data.data.name || '');
            const statusElement = document.getElementById(cfg.statusId);
            if (statusElement) statusElement.innerText = '✓ Terdaftar';
            const infoElement = document.getElementById(cfg.infoId);
            if (infoElement) infoElement.style.display = 'flex';
            Swal.fire('Sukses', `Nomor valid: ${data.data.name}`, 'success');
        } else {
            const fallbackName = `User ${type} (${cleanNumber.slice(-4)})`;
            cfg.setUser({ name: fallbackName, number: cleanNumber });
            const nameElement = document.getElementById(cfg.nameId);
            if (nameElement) nameElement.innerHTML = `<span style="color: #f39c12;">${fallbackName}</span>`;
            const statusElement = document.getElementById(cfg.statusId);
            if (statusElement) statusElement.innerText = '✓ Lanjut Tanpa Cek';
            const infoElement = document.getElementById(cfg.infoId);
            if (infoElement) infoElement.style.display = 'flex';
            Swal.fire('Info', 'Cek nama tidak tersedia, silakan lanjutkan dengan hati-hati!', 'warning');
        }
    } catch (e) {
        clearTimeout(timeoutId);
        console.error("Error:", e);
        
        const fallbackName = `User ${type} (${cleanNumber.slice(-4)})`;
        cfg.setUser({ name: fallbackName, number: cleanNumber });
        const nameElement = document.getElementById(cfg.nameId);
        if (nameElement) nameElement.innerHTML = `<span style="color: #f39c12;">${fallbackName}</span>`;
        const statusElement = document.getElementById(cfg.statusId);
        if (statusElement) statusElement.innerText = 'Cek Gagal, Lanjutkan';
        const infoElement = document.getElementById(cfg.infoId);
        if (infoElement) infoElement.style.display = 'flex';
        Swal.fire('Info', 'Gagal cek nama, pastikan nomor sudah benar!', 'warning');
    } finally {
        clearTimeout(timeoutId);
        if (btn) {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
        }
        if(typeof window[cfg.checkOrderFn] === 'function') window[cfg.checkOrderFn]();
    }
}

// =========================================================
// 3. JEMBATAN FUNGSI LAMA (OTOMATIS NIMPA KODE LAMA)
// =========================================================
async function checkEwalletNumber() { await checkEwalletNumberGlobal('DANA'); }
window.checkEwalletNumberGD = async function() { await checkEwalletNumberGlobal('GOPAY_DRIVER'); };
window.checkEwalletNumberGopay = async function() { await checkEwalletNumberGlobal('GOPAY'); };
window.checkOvoNumber = async function() { await checkEwalletNumberGlobal('OVO'); };
window.checkShopeeNumber = async function() { await checkEwalletNumberGlobal('SHOPEEPAY'); };
window.checkLinkajaNumber = async function() { await checkEwalletNumberGlobal('LINKAJA'); };
window.checkAstrapayNumber = async function() { await checkEwalletNumberGlobal('ASTRAPAY'); };
window.checkIsakuNumber = async function() { await checkEwalletNumberGlobal('ISAKU'); };
window.checkKasproNumber = async function() { await checkEwalletNumberGlobal('KASPRO'); };

function checkEwalletInput() {
    const phone = document.getElementById('ewalletPhone').value;
    if (phone.length >= 10) {
        // Jangan set name otomatis, biar dari API
        if (!checkedEwalletUser) {
            checkedEwalletUser = { name: "Memuat...", number: phone };
        }
    } else {
        document.getElementById('ewalletUserInfo').style.display = 'none';
        checkedEwalletUser = null;
    }
    checkOrderEwallet();
}

function resetEwalletInputs() {
    document.getElementById('ewalletPhone').value = '';
    document.getElementById('ewalletUserInfo').style.display = 'none';
    checkedEwalletUser = null;
    selectedEwalletCode = null;
    selectedEwalletPrice = 0;
    selectedEwalletData = null;
    selectedMethodEwallet = 'saldo';
    resetPromo('ewallet');
    checkOrderEwallet();
}

function selectPayMethodEwallet(method) {
    selectedMethodEwallet = method;
    const nameElEwallet = document.getElementById('metodeNameEwallet');
    if (nameElEwallet) nameElEwallet.innerText = getMetodeLabel(method);
    const rincianNameElEwallet = document.getElementById('rincianMetodeNameEwallet');
    if (rincianNameElEwallet) rincianNameElEwallet.innerText = getMetodeLabel(method);
    checkOrderEwallet();
}

function checkOrderEwallet() {
    const btn = document.getElementById('btnBuyEwallet');
    const footerPrice = document.getElementById('footerPriceEwallet');
    const alert = document.getElementById('footerAlertEwallet');

    if (checkedEwalletUser && selectedEwalletCode && selectedMethodEwallet) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
        footerPrice.innerText = 'Rp ' + (selectedEwalletPrice || 0).toLocaleString();
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';

        let msg = "Lengkapi data.";
        if (!checkedEwalletUser) msg = "Masukkan nomor DANA yang valid (08xxxxxxxxxx).";
        else if (!selectedEwalletCode) msg = "Pilih nominal topup.";
        else if (!selectedMethodEwallet) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        footerPrice.innerText = 'Rp 0';
    }
}

// ============ GOPAY DRIVER ============
async function fetchEwalletProductsGD() {
    const grid = document.getElementById('ewalletProductGridGD');
    const loading = document.getElementById('ewalletProductLoadingGD');
    if (!grid || !loading) return;

    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const res = await fetch('/api/ewallet/products/gopay-driver');
        const json = await res.json();
        loading.style.display = 'none';
        if (json.success && json.data.length > 0) {
            ewalletProductsGD = json.data;
            renderEwalletProductsGD();
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk.</div>';
        }
    } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
    }
}

function renderEwalletProductsGD() {
    const grid = document.getElementById('ewalletProductGridGD');
    grid.innerHTML = '';

    ewalletProductsGD.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectProductEwalletGD(card, p);
        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-money-bill-wave" style="font-size:24px; line-height:30px; height:30px; margin-bottom:5px; color:var(--primary-color);"></i>
                <span class="prod-name" style="font-size:12px;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>`;
        grid.appendChild(card);
    });
}

function selectProductEwalletGD(el, data) {
    document.querySelectorAll('#ewalletProductGridGD .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedEwalletCodeGD = data.code;
    selectedEwalletPriceGD = data.price;
    selectedEwalletDataGD = data;
    checkOrderEwalletGD();
    resetPromo('ewallet-gd');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('ewallet-gd', 1);
}

async function checkEwalletNumberGD() {
    const phoneNumber = document.getElementById('ewalletPhoneGD').value;
    if (!phoneNumber) return Swal.fire('Error', 'Masukkan nomor terlebih dahulu!', 'warning');

    const btn = document.getElementById('btnCheckEwalletGD');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const res = await fetch('/api/ewallet/check/gopay-driver', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_number: phoneNumber })
        });
        const data = await res.json();

        if (data.success) {
            let uName = data.data.name || data.data || "Valid / Aktif";
            checkedEwalletUserGD = { name: uName, number: phoneNumber };
            document.getElementById('ewalletNameGD').innerText = checkedEwalletUserGD.name;
            document.getElementById('ewalletUserInfoGD').style.display = 'flex';
            Swal.fire('Sukses', `Nomor Valid: ${checkedEwalletUserGD.name}`, 'success');
        } else {
            Swal.fire('Gagal', data.message, 'error');
            checkedEwalletUserGD = null;
            document.getElementById('ewalletUserInfoGD').style.display = 'none';
        }
    } catch (e) {
        Swal.fire('Error', 'Gagal server', 'error');
    } finally {
        btn.innerHTML = 'CEK NOMOR';
        btn.disabled = false;
        checkOrderEwalletGD();
    }
}

function checkEwalletInputGD() {
    const phone = document.getElementById('ewalletPhoneGD').value;
    if (phone.length >= 10) {
        checkedEwalletUserGD = { name: "Driver GoPay", number: phone };
    } else {
        document.getElementById('ewalletUserInfoGD').style.display = 'none';
        checkedEwalletUserGD = null;
    }
    checkOrderEwalletGD();
}

function resetEwalletInputsGD() {
    document.getElementById('ewalletPhoneGD').value = '';
    document.getElementById('ewalletUserInfoGD').style.display = 'none';
    checkedEwalletUserGD = null;
    selectedEwalletCodeGD = null;
    selectedEwalletPriceGD = 0;
    selectedEwalletDataGD = null;
    selectedMethodEwalletGD = 'saldo';
    resetPromo('ewallet-gd');
    checkOrderEwalletGD();
}

function selectPayMethodEwalletGD(method) {
    selectedMethodEwalletGD = method;
    const nameElEwalletGD = document.getElementById('metodeNameEwalletGD');
    if (nameElEwalletGD) nameElEwalletGD.innerText = getMetodeLabel(method);
    const rincianNameElEwalletGD = document.getElementById('rincianMetodeNameEwalletGD');
    if (rincianNameElEwalletGD) rincianNameElEwalletGD.innerText = getMetodeLabel(method);
    checkOrderEwalletGD();
}

function checkOrderEwalletGD() {
    const btn = document.getElementById('btnBuyEwalletGD');
    const fPrice = document.getElementById('footerPriceEwalletGD');
    const alert = document.getElementById('footerAlertEwalletGD');

    if (checkedEwalletUserGD && selectedEwalletCodeGD && selectedMethodEwalletGD) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
        fPrice.innerText = 'Rp ' + selectedEwalletPriceGD.toLocaleString();
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';
        fPrice.innerText = 'Rp 0';

        let msg = "Lengkapi data.";
        if (!checkedEwalletUserGD) msg = "Masukkan nomor GoPay Driver yang valid (08xxxxxxxxxx).";
        else if (!selectedEwalletCodeGD) msg = "Pilih nominal topup.";
        else if (!selectedMethodEwalletGD) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    }
}

// ============ GOPAY CUSTOMER ============
async function fetchEwalletProductsGopay() {
    const grid = document.getElementById('ewalletProductGridGopay');
    const loading = document.getElementById('ewalletProductLoadingGopay');
    if (!grid || !loading) return;

    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const res = await fetch('/api/ewallet/products/gopay');
        const json = await res.json();
        loading.style.display = 'none';
        if (json.success && json.data.length > 0) {
            ewalletProductsGopay = json.data;
            renderEwalletProductsGopay();
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk.</div>';
        }
    } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
    }
}

function renderEwalletProductsGopay() {
    const grid = document.getElementById('ewalletProductGridGopay');
    grid.innerHTML = '';

    ewalletProductsGopay.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        const badgeHTML = p.isPromo ? `<div style="position:absolute; top:-5px; right:-5px; background:#e74c3c; color:white; font-size:9px; padding:2px 5px; border-radius:5px; font-weight:bold;">PROMO</div>` : '';
        card.onclick = () => selectProductEwalletGopay(card, p);
        card.innerHTML = `
            ${badgeHTML}
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center; position:relative;">
                <i class="fas fa-money-bill-wave" style="font-size:24px; line-height:30px; height:30px; margin-bottom:5px; color:var(--primary-color);"></i>
                <span class="prod-name" style="font-size:11px; text-align:center;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>`;
        grid.appendChild(card);
    });
}

function selectProductEwalletGopay(el, data) {
    document.querySelectorAll('#ewalletProductGridGopay .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedEwalletCodeGopay = data.code;
    selectedEwalletPriceGopay = data.price;
    selectedEwalletDataGopay = data;
    checkOrderEwalletGopay();
    resetPromo('ewallet-gopay');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('ewallet-gopay', 1);
}

async function checkEwalletNumberGopay() {
    const phoneNumber = document.getElementById('ewalletPhoneGopay').value;
    if (!phoneNumber) return Swal.fire('Error', 'Masukkan nomor terlebih dahulu!', 'warning');

    const btn = document.getElementById('btnCheckEwalletGopay');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const res = await fetch('/api/ewallet/check/gopay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_number: phoneNumber })
        });
        const data = await res.json();

        if (data.success) {
            checkedEwalletUserGopay = data.data;
            document.getElementById('ewalletUserInfoGopay').style.display = 'flex';
            Swal.fire('Sukses', `Nomor Valid`, 'success');
        } else {
            Swal.fire('Gagal', data.message, 'error');
            checkedEwalletUserGopay = null;
            document.getElementById('ewalletUserInfoGopay').style.display = 'none';
        }
    } catch (e) {
        Swal.fire('Error', 'Gagal server', 'error');
    } finally {
        btn.innerHTML = 'CEK NOMOR';
        btn.disabled = false;
        checkOrderEwalletGopay();
    }
}

function checkEwalletInputGopay() {
    const phone = document.getElementById('ewalletPhoneGopay').value;
    if (phone.length >= 10) {
        checkedEwalletUserGopay = { name: "Member GoPay", number: phone };
    } else {
        document.getElementById('ewalletUserInfoGopay').style.display = 'none';
        checkedEwalletUserGopay = null;
    }
    checkOrderEwalletGopay();
}

function resetEwalletInputsGopay() {
    document.getElementById('ewalletPhoneGopay').value = '';
    document.getElementById('ewalletUserInfoGopay').style.display = 'none';
    checkedEwalletUserGopay = null;
    selectedEwalletCodeGopay = null;
    selectedEwalletPriceGopay = 0;
    selectedEwalletDataGopay = null;
    selectedMethodEwalletGopay = 'saldo';
    resetPromo('ewallet-gopay');
    checkOrderEwalletGopay();
}

function selectPayMethodEwalletGopay(method) {
    selectedMethodEwalletGopay = method;
    const nameElEwalletGopay = document.getElementById('metodeNameEwalletGopay');
    if (nameElEwalletGopay) nameElEwalletGopay.innerText = getMetodeLabel(method);
    const rincianNameElEwalletGopay = document.getElementById('rincianMetodeNameEwalletGopay');
    if (rincianNameElEwalletGopay) rincianNameElEwalletGopay.innerText = getMetodeLabel(method);
    checkOrderEwalletGopay();
}

function checkOrderEwalletGopay() {
    const btn = document.getElementById('btnBuyEwalletGopay');
    const fPrice = document.getElementById('footerPriceEwalletGopay');
    const alert = document.getElementById('footerAlertEwalletGopay');

    if (checkedEwalletUserGopay && selectedEwalletCodeGopay && selectedMethodEwalletGopay) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
        fPrice.innerText = 'Rp ' + (selectedEwalletPriceGopay || 0).toLocaleString();
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';
        fPrice.innerText = 'Rp 0';

        let msg = "Lengkapi data.";
        if (!checkedEwalletUserGopay) msg = "Masukkan nomor GoPay yang valid (08xxxxxxxxxx).";
        else if (!selectedEwalletCodeGopay) msg = "Pilih nominal topup.";
        else if (!selectedMethodEwalletGopay) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    }
}

// ============ INFO ============
function loadInfoPage() {
    if (activityData.length > 0) {
        const newestId = activityData[0].id;
        localStorage.setItem('lastReadActivityId', newestId);
        const badge = document.getElementById('infoBadge');
        if (badge) badge.classList.remove('show');
        const navInfoIcon = document.querySelector('.nav-item[data-target="info"] i');
        if (navInfoIcon) navInfoIcon.classList.remove('shake-bell');
    }

    const containerNotif = document.getElementById('listPemberitahuan');
    const containerInfo = document.getElementById('listInformasi');

    if (containerNotif) containerNotif.innerHTML = '';
    if (containerInfo) containerInfo.innerHTML = '';

    if (!activityData || activityData.length === 0) {
        const cached = localStorage.getItem('cachedActivityData');
        if (cached) activityData = JSON.parse(cached);
        else {
            if (containerNotif) containerNotif.innerHTML = '<div style="text-align:center; padding:30px; font-size:12px; color:#aaa;">Belum ada aktivitas.</div>';
            return;
        }
    }

    const transactions = activityData.filter(item => item.type === 'transaction');
    const adminMessages = activityData.filter(item => item.type === 'broadcast');

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const myUsername = user.username || '';
    const lastReadAllTime = parseInt(localStorage.getItem('last_read_all_time') || '0');
    const readList = JSON.parse(localStorage.getItem('read_items') || '[]');

    if (transactions.length === 0) {
        if (containerNotif) containerNotif.innerHTML = '<div style="text-align:center; padding:30px; font-size:12px; color:#aaa;">Belum ada transaksi.</div>';
    } else {
        transactions.forEach(item => {
            const notifTime = new Date(item.time || item.date || 0).getTime();
            const isUnread = !readList.includes(item.id) && (notifTime > lastReadAllTime);
            
            const unreadClass = isUnread ? 'unread-item' : '';
            const dotHtml = isUnread ? '<div class="unread-dot-card" style="width:8px; height:8px; background:#e74c3c; border-radius:50%; display:inline-block; margin-right:5px;"></div>' : '';

            let timeString = timeAgo(item.time);
            let iconHtml = '<i class="fas fa-coins" style="color:var(--primary-color);"></i>';
            let displayText = `<b>${item.name}</b> order <b>${item.desc}</b>`;

            if (item.trx_type === 'deposit') {
                iconHtml = '<i class="fas fa-money-bill" style="color:var(--primary-color);"></i>';
                displayText = `<b>${item.name}</b> deposit <b>${item.desc}</b>`;
            } else if (item.trx_type && item.trx_type.includes('transfer')) {
                let sender = item.name;
                let rawDesc = item.desc;

                let recipientMatch = rawDesc.match(/@([a-zA-Z0-9_]+)/);
                let recipient = recipientMatch ? recipientMatch[1] : 'seseorang';
                let amountMatch = rawDesc.match(/Rp\s*([0-9.,]+)/i);
                let amountStr = amountMatch ? `Rp ${amountMatch[1]}` : 'Uang';

                if (myUsername === recipient) {
                    iconHtml = '<i class="fas fa-arrow-down" style="color:var(--primary-color);"></i>';
                    displayText = `<span style="color:#2ecc71; font-weight:bold;">Dana Masuk!</span> Menerima ${amountStr} dari @${sender}`;
                } else if (myUsername === sender) {
                    iconHtml = '<i class="fas fa-arrow-up" style="color:var(--primary-color);"></i>';
                    displayText = `<span style="color:#3498db; font-weight:bold;">Transfer Berhasil</span> Mengirim ${amountStr} ke @${recipient}`;
                } else {
                    iconHtml = '<i class="fas fa-money-bill-transfer" style="color:var(--primary-color);"></i>';
                    displayText = `<b>@${sender}</b> transfer ${amountStr} ke <b>@${recipient}</b>`;
                }
            } else if (item.trx_type && item.trx_type.includes('panel')) {
                iconHtml = '<i class="fas fa-server" style="color:var(--primary-color);"></i>';
                if (item.trx_type === 'extend_panel') displayText = `<b>${item.name}</b> melakukan <b>${item.desc}</b>`;
                else displayText = `<b>${item.name}</b> order <b>${item.desc}</b>`;
            } else if (item.trx_type && item.trx_type.includes('script')) { iconHtml = '<i class="fas fa-scroll" style="color:var(--primary-color);"></i>'; displayText = `<b>${item.name}</b> order <b>${item.desc}</b>`;
            } else if (item.trx_type && item.trx_type.includes('murid')) { iconHtml = '<i class="fas fa-graduation-cap" style="color:var(--primary-color);"></i>'; displayText = `<b>${item.name}</b> order <b>${item.desc}</b>`;
            } else if (item.trx_type && item.trx_type.includes('sosmed')) { iconHtml = '<i class="fas fa-rocket" style="color:var(--primary-color);"></i>'; displayText = `<b>${item.name}</b> order <b>${item.desc}</b>`;
            } else if (item.trx_type && item.trx_type.includes('game')) { iconHtml = '<i class="fas fa-gamepad" style="color:var(--primary-color);"></i>'; displayText = `<b>${item.name}</b> topup <b>${item.desc}</b>`;
            } else if (item.trx_type && item.trx_type.includes('ewallet')) { iconHtml = '<i class="fas fa-wallet" style="color:var(--primary-color);"></i>'; displayText = `<b>${item.name}</b> topup <b>${item.desc}</b>`; }
            else if (item.trx_type && item.trx_type.includes('nokos')) { iconHtml = '<i class="fas fa-sim-card" style="color:var(--primary-color);"></i>'; displayText = `<b>${item.name}</b> order <b>${item.desc}</b>`; }
            const html = `
                <div onclick="markItemAsRead('${item.id}', this)" class="${unreadClass}" style="
                    display:flex; align-items:center; padding:12px 10px; border-bottom:1px solid #f0f0f0; gap:10px; cursor:pointer; transition:0.3s;
                ">
                    <div style="font-size:18px; width:30px; text-align:center;">${iconHtml}</div>
                    <div style="flex:1;">
                        <div style="font-size:12px; color:#333; line-height:1.3;">
                            ${dotHtml} ${displayText}
                        </div>
                        <div style="font-size:10px; color:#999; margin-top:2px;">${timeString}</div>
                    </div>
                </div>
            `;
            if (containerNotif) containerNotif.insertAdjacentHTML('beforeend', html);
        });
    }

    if (adminMessages.length === 0) {
        if (containerInfo) containerInfo.innerHTML = '<div style="text-align:center; padding:30px; font-size:12px; color:#aaa;">Belum ada info admin.</div>';
    } else {
        adminMessages.forEach(item => {
            const notifTime = new Date(item.time || item.date || 0).getTime();
            const isUnread = !readList.includes(item.id) && (notifTime > lastReadAllTime);
            const unreadClass = isUnread ? 'unread-item' : '';
            const dotHtml = isUnread ? '<div class="unread-dot-card" style="width:8px; height:8px; background:#e74c3c; border-radius:50%; display:inline-block; margin-right:5px;"></div>' : '';

            let timeString = timeAgo(item.time);
            let title = 'Informasi';
            let borderColor = '#3498db';
            let bgHeader = '#e3f2fd';

            if (item.level === 'promo') { title = '<i class="fas fa-tags"></i> Promo'; borderColor = '#f39c12'; bgHeader = '#fff3e0'; }
            if (item.level === 'warning') { title = '<i class="fas fa-triangle-exclamation"></i> Penting'; borderColor = '#e74c3c'; bgHeader = '#ffebee'; }

            const html = `
            <div onclick="markItemAsRead('${item.id}', this)" class="${unreadClass}" style="
                position:relative; background:#fff; border:1px solid #eee; border-left: 3px solid ${borderColor}; border-radius: 8px; padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); cursor: pointer; transition: 0.3s;
            ">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <span style="font-size:11px; font-weight:bold; color:${borderColor}; background:${bgHeader}; padding:2px 6px; border-radius:4px;">
                        ${dotHtml} ${title}
                    </span>
                    <span style="font-size:9px; color:#aaa;">${timeString}</span>
                </div>
                <div style="font-size:12px; color:#444; line-height:1.5;">
                    ${convertToLink(item.desc)}
                </div>
            </div>`;
            if (containerInfo) containerInfo.insertAdjacentHTML('beforeend', html);
        });
    }
}

window.switchInfoTab = function(tabName) {
    document.getElementById('tabNotif').classList.remove('active');
    document.getElementById('tabInfo').classList.remove('active');

    const listNotif = document.getElementById('listPemberitahuan');
    const listInfo = document.getElementById('listInformasi');

    if (listNotif) listNotif.style.display = 'none';
    if (listInfo) listInfo.style.display = 'none';

    if (tabName === 'pemberitahuan') {
        document.getElementById('tabNotif').classList.add('active');
        if (listNotif) {
            listNotif.style.display = 'flex';
            listNotif.style.flexDirection = 'column';
        }

        const dot = document.getElementById('tabNotif').querySelector('.tab-red-dot');
        if (dot) dot.remove();

        const latestTrx = activityData.find(item => item.type === 'transaction');
        if (latestTrx) localStorage.setItem('last_seen_trx', latestTrx.id);

    } else {
        document.getElementById('tabInfo').classList.add('active');
        if (listInfo) {
            listInfo.style.display = 'block';
            loadInfoPage();
        }
    }
};

window.markItemAsRead = function(id, element) {
    let readList = JSON.parse(localStorage.getItem('read_items') || '[]');

    if (!readList.includes(id)) {
        readList.push(id);
        localStorage.setItem('read_items', JSON.stringify(readList));
    }

    element.classList.remove('unread-item');
    const dot = element.querySelector('.unread-dot-card');
    if (dot) dot.style.display = 'none';

    updateInfoTabsRedDots();

    const hasUnread = activityData.some(item => !readList.includes(item.id));
    const bellBadge = document.getElementById('infoBadge');
    const bellIcon = document.querySelector('.nav-item[data-target="info"] i');

    if (isInfoMenuOpened || !hasUnread) {
        if (bellBadge) bellBadge.classList.remove('show');
        if (bellIcon) bellIcon.classList.remove('shake-bell');
    }
};

function updateInfoTabsRedDots() {
    const readList = JSON.parse(localStorage.getItem('read_items') || '[]');
    const lastReadAllTime = parseInt(localStorage.getItem('last_read_all_time') || '0');

    const unreadNotif = activityData.filter(i => {
        const notifTime = new Date(i.time || i.date || 0).getTime();
        return i.type === 'transaction' && !readList.includes(i.id) && (notifTime > lastReadAllTime);
    }).length;

    const unreadInfo = activityData.filter(i => {
        const notifTime = new Date(i.time || i.date || 0).getTime();
        return i.type === 'broadcast' && !readList.includes(i.id) && (notifTime > lastReadAllTime);
    }).length;

    const tabNotif = document.getElementById('tabNotif');
    if (tabNotif) {
        const dot = tabNotif.querySelector('.tab-red-dot');
        if (unreadNotif > 0) {
            if (!dot) {
                const newDot = document.createElement('div');
                newDot.className = 'tab-red-dot';
                tabNotif.appendChild(newDot);
            }
        } else if (dot) dot.remove();
    }

    const tabInfo = document.getElementById('tabInfo');
    if (tabInfo) {
        const dot = tabInfo.querySelector('.tab-red-dot');
        if (unreadInfo > 0) {
            if (!dot) {
                const newDot = document.createElement('div');
                newDot.className = 'tab-red-dot';
                tabInfo.appendChild(newDot);
            }
        } else if (dot) dot.remove();
    }
}

// ============ RIWAYAT SMM ============
async function loadRiwayatSMM() {
    const container = document.getElementById('listRiwayatSMM');
    container.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin"></i> Mengambil data...</div>';

    const { token } = checkLogin();

    try {
        const res = await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();

        if (data.success) {
            const smmTrx = data.data.filter(t => t.type === 'buy_sosmed' && t.provider_oid);

            if (smmTrx.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:30px; color:#999;">Belum ada riwayat order SMM.</div>';
                return;
            }

            let html = '<div class="panel-scroll-container">';

            smmTrx.forEach((trx) => {
                html += `
                    <div class="panel-card-item">
                        <div class="panel-card-header">
                            <span style="font-weight:bold; color:var(--primary-color); font-size:12px;">#${trx.provider_oid}</span>
                            <span id="badge-${trx.provider_oid}" style="font-size:10px; background:#bdc3c7; color:white; padding:2px 6px; border-radius:4px;">Loading...</span>
                        </div>
                        
                        <div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:5px; height:35px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
                            ${trx.product_data.product_name}
                        </div>
                        
                        <div style="font-size:11px; color:#666; margin-bottom:5px;">
                            Target: <b style="color:#3498db">${trx.product_data.target}</b>
                        </div>
                        <div style="font-size:11px; color:#666; margin-bottom:5px;">
                             Jumlah: <b>${trx.product_data.qty}</b>
                        </div>

                        <div id="detail-${trx.provider_oid}" style="background:#f9f9f9; padding:8px; border-radius:6px; font-size:11px; margin-top:5px; border:1px dashed #ddd;">
                            <i class="fas fa-sync fa-spin"></i> Cek Pusat...
                        </div>
                    </div>
                `;
            });

            html += '</div>';
            html += '<div style="text-align:center; font-size:10px; color:#aaa; margin-top:5px;"><i class="fas fa-arrows-alt-h"></i> Geser ke samping</div>';

            container.innerHTML = html;

            smmTrx.forEach(trx => checkLiveStatusSMM(trx.provider_oid, trx.order_id));

        } else {
            container.innerHTML = 'Gagal memuat history.';
        }
    } catch (e) {
        container.innerHTML = 'Error koneksi.';
    }
}

async function checkLiveStatusSMM(providerOid, localOrderId) {
    const { token } = checkLogin();
    const badgeEl = document.getElementById(`badge-${providerOid}`);
    const detailEl = document.getElementById(`detail-${providerOid}`);

    try {
        const res = await fetch('/api/sosmed/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, provider_oid: providerOid, order_id_local: localOrderId })
        });
        const json = await res.json();

        if (json.success) {
            const d = json.data;

            let color = '#f39c12';
            if (d.status === 'Success') color = '#2ecc71';
            if (d.status === 'Error' || d.status === 'Partial') color = '#e74c3c';
            if (d.status === 'Pending') color = '#95a5a6';

            if (badgeEl) {
                badgeEl.style.background = color;
                badgeEl.innerText = d.status.toUpperCase();
            }

            if (detailEl) {
                detailEl.innerHTML = `
                    <div style="display:flex; justify-content:space-between;">
                        <span><i class="fas fa-flag-checkered"></i> Awal: <b>${d.start_count || 0}</b></span>
                        <span><i class="fas fa-arrow-trend-down"></i> Sisa: <b>${d.remains || 0}</b></span>
                    </div>
                `;
            }
        } else {
            if (detailEl) detailEl.innerHTML = '<span style="color:red;">Gagal cek pusat</span>';
            if (badgeEl) badgeEl.innerText = "UNKNOWN";
        }
    } catch (e) {
        console.log(e);
    }
}

// ============ RIWAYAT TRANSFER ============
function checkNewTransfer() {
    return; // digantikan notif pribadi dari server (pollMyNotifs)
    const lastCheck = localStorage.getItem('lastTransferCheck') || 0;
    const now = Date.now();

    if (now - lastCheck > 10000) {
        localStorage.setItem('lastTransferCheck', now);

        const lastTransfer = JSON.parse(localStorage.getItem('lastTransfer') || 'null');

        if (lastTransfer && lastTransfer.time > lastCheck) {
            const user = JSON.parse(localStorage.getItem('user') || '{}');

            if (user.username) {
                if (lastTransfer.recipient === user.username) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Saldo Masuk!',
                        html: `<div style="text-align:center;">
                            <div style="font-size:20px; font-weight:bold; color:var(--primary-color); margin:5px 0;">
                                Rp ${parseInt(lastTransfer.amount).toLocaleString('id-ID')}
                            </div>
                            <div style="font-size:13px;">
                                dari <b>@${lastTransfer.sender}</b>
                            </div>
                        </div>`,
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 5000,
                        timerProgressBar: true,
                        background: '#e8f5e9',
                        iconColor: '#2ecc71',
                        didOpen: (toast) => {
                            toast.addEventListener('mouseenter', Swal.stopTimer);
                            toast.addEventListener('mouseleave', Swal.resumeTimer);
                        }
                    });
                } else if (lastTransfer.sender === user.username) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Transfer Berhasil',
                        html: `<div style="text-align:center;">
                            <div style="font-size:20px; font-weight:bold; color:var(--primary-color); margin:5px 0;">
                                Rp ${parseInt(lastTransfer.amount).toLocaleString('id-ID')}
                            </div>
                            <div style="font-size:13px;">
                                ke <b>@${lastTransfer.recipient}</b>
                            </div>
                        </div>`,
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 5000,
                        timerProgressBar: true,
                        background: '#e3f2fd',
                        iconColor: '#2196F3'
                    });
                }
            }

            localStorage.removeItem('lastTransfer');
        }
    }
}

// ============ RIWAYAT TRANSAKSI ============
async function loadHistory() {
    const container = document.getElementById('trx-container');
    if (!container) return;

    // Spinner hanya muncul sekali saat pertama buka, setelah itu tidak pernah lagi
    if (!window._historyLoaded) {
        container.innerHTML = '<div style="text-align:center; padding:50px; color:#888;"><i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Memuat data...</div>';
    }

    const { token } = checkLogin();
    if (!token) {
        window._historyLoaded = true;
        container.innerHTML = '<div style="text-align:center; padding:50px;">Silakan login untuk melihat riwayat.</div>';
        return;
    }

    try {
        const res = await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
            credentials: 'include'
        });
        const data = await res.json();

        // Setelah dapat response apapun, flag true — spinner tidak muncul lagi
        window._historyLoaded = true;

        if (data.success) {
            allTransactions = data.data || [];

            const activeFilterBtn = document.querySelector('.tab-item-clean.active');
            const filter = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';

            if (filter === 'all') {
                renderTransactionList(allTransactions);
            } else if (filter === 'success') {
                renderTransactionList(allTransactions.filter(t => t.status === 'success'));
            } else if (filter === 'pending') {
                renderTransactionList(allTransactions.filter(t => t.status === 'pending' || t.status === 'proses'));
            } else if (filter === 'failed') {
                renderTransactionList(allTransactions.filter(t => t.status === 'canceled' || t.status === 'expired'));
            }
        } else {
            renderTransactionList([]);
        }
    } catch (e) {
        window._historyLoaded = true;
        container.innerHTML = '<div style="text-align:center; padding:50px;">Gagal terhubung ke server.</div>';
    }
}

// Label khusus untuk gacha & THR (supaya tidak tampil sebagai "Transaksi"/"Deposit")
function trxSpecial(trx) {
    const pd = trx.product_data || {};
    const pn = String(pd.product_name || '');
    const amt = parseInt(trx.amount) || 0;
    const rp = n => 'Rp ' + Number(n).toLocaleString('id-ID');
    if (trx.type === 'gacha_reward') {
        const prize = pd.prize || pn.replace(/^Hadiah Gacha:\s*/i, '') || 'Hadiah';
        return { title: 'Gacha: ' + prize, item: 'Gacha Harian\n(' + prize + ')', header: 'Gacha Berhasil',
                 icon: '<i class="fas fa-dice" style="color:#f39c12"></i>', label: 'Hadiah', amountText: amt > 0 ? '+' + rp(amt) : 'Item' };
    }
    if (trx.type === 'refund_thr') {
        return { title: 'Refund Sisa THR', item: 'Refund sisa THR' + (pd.code ? '\n(' + pd.code + ')' : ''), header: 'THR Dikembalikan',
                 icon: '<i class="fas fa-rotate-left" style="color:#3498db"></i>', label: 'Dikembalikan', amountText: '+' + rp(amt) };
    }
    if (trx.type === 'transfer_out' && (pd.kind === 'thr_create' || /THR/i.test(pn))) {
        let nm = pd.creator_name;
        if (!nm) { try { nm = (JSON.parse(localStorage.getItem('user') || '{}').fullname) || ''; } catch (e) {} }
        nm = nm || 'Kamu';
        const to = pd.winners ? ' untuk ' + pd.winners + ' orang' : '';
        return { title: nm + ' telah berbagi THR', item: nm + ' telah berbagi THR' + to + (pd.code ? '\n(' + pd.code + ')' : ''), header: 'THR Dibagikan',
                 icon: '<i class="fas fa-envelope-open-text" style="color:#e74c3c"></i>', label: 'Total THR', amountText: rp(amt) };
    }
    if (trx.type === 'transfer_in' && (pd.kind === 'thr_claim' || /THR/i.test(pn))) {
        const sender = pd.creator_name || (pd.sender ? '@' + pd.sender : 'Seseorang');
        return { title: 'Mendapatkan THR dari ' + sender, item: 'Mendapatkan THR dari ' + sender + ' sebesar Rp ' + Number(amt).toLocaleString('id-ID'), header: 'THR Diterima',
                 icon: '<i class="fas fa-envelope-open-text" style="color:#2ecc71"></i>', label: 'Diterima', amountText: '+' + rp(amt) };
    }
    return null;
}

function renderTransactionList(dataList) {
    const container = document.getElementById('trx-container');
    const emptyState = document.getElementById('empty-state');
    container.innerHTML = '';

    if (dataList.length > 0) {
        emptyState.style.display = 'none';
        dataList.forEach(trx => {
            let badgeClass = 'st-pending';
            let statusLabel = trx.status.toUpperCase();
            let icon = '<i class="fas fa-clock" style="color:#f39c12"></i>';

            if (trx.status === 'success') {
                badgeClass = 'st-sukses';
                statusLabel = 'SUKSES';
                icon = '<i class="fas fa-check-circle" style="color:#2ecc71"></i>';
            } else if (trx.status === 'proses') {
                badgeClass = 'st-pending';
                statusLabel = 'DIPROSES';
                icon = '<i class="fas fa-spinner fa-spin" style="color:#3498db"></i>';
            } else if (trx.status === 'canceled') {
                badgeClass = 'st-gagal';
                statusLabel = 'DIBATALKAN';
                icon = '<i class="fas fa-times-circle" style="color:#e74c3c"></i>';
            } else if (trx.status === 'expired') {
                badgeClass = 'st-gagal';
                statusLabel = 'EXPIRED';
                icon = '<i class="fas fa-exclamation-circle" style="color:#e74c3c"></i>';
            }

            const item = document.createElement('div');
            item.className = 'trx-item';
            item.onclick = () => openInvoice(trx);
            item.style.cursor = 'pointer';

            // Default "Deposit Saldo" HANYA untuk tipe deposit. Tipe lain yang belum dikenal diberi label umum.
            let title = (!trx.type || trx.type === 'deposit') ? 'Deposit Saldo' : 'Transaksi';
            let pName = (trx.product_data && trx.product_data.product_name) ? trx.product_data.product_name : '';

            if (trx.type === 'buy_panel') title = pName ? `Beli Panel ${pName}` : 'Beli Panel';
            else if (trx.type === 'buy_script') title = pName ? `Beli Script ${pName}` : 'Beli Script';
            else if (trx.type === 'buy_murid') title = pName ? `Join Kelas ${pName}` : 'Join Murid';
            else if (trx.type === 'buy_vps') title = pName ? `Order VPS ${pName}` : 'Order VPS';
            else if (trx.type === 'buy_nokos') title = pName ? `Nokos ${pName}` : 'Nokos OTP';
            else if (trx.type === 'buy_subdomain') title = pName ? `Beli Subdomain ${pName}` : 'Beli Subdomain';
            else if (trx.type === 'extend_panel') title = pName || 'Perpanjang Panel';
            else if (trx.type === 'transfer_qris') {
                const rcp = (trx.product_data && trx.product_data.recipient) ? trx.product_data.recipient : '';
                title = rcp ? `Transfer QRIS ke @${rcp}` : 'Transfer QRIS';
            }
            else if (trx.type === 'transfer_personal') title = 'Transfer QRIS';
            else if (trx.type === 'buy_sosmed') title = pName ? `Suntuik ${pName}` : 'Layanan Sosmed';
            else if (trx.type === 'buy_ewallet') {
                if (trx.status === 'success') title = `Berhasil topup ${pName || 'E-Wallet'}`;
                else title = `Topup ${pName || 'E-Wallet'}`;
            } else if (trx.type === 'buy_game') {
                if (trx.status === 'success') title = `Berhasil topup ${pName || 'Game'}`;
                else title = `Topup ${pName || 'Game'}`;
            }
            else if (trx.type === 'transfer_out') {
                const recipient = (trx.product_data && trx.product_data.recipient) ? trx.product_data.recipient : 'Seseorang';
                title = `Transfer ke @${recipient}`;
            } else if (trx.type === 'transfer_in') {
                const sender = (trx.product_data && trx.product_data.sender) ? trx.product_data.sender : 'Seseorang';
                title = `Terima dari @${sender}`;
            } else if (trx.type === 'buy_premium_app') {
                title = pName ? `App Premium: ${pName}` : 'Aplikasi Premium';
            }

            const sp = trxSpecial(trx);
            let amountShown = 'Rp ' + parseInt(trx.amount).toLocaleString();
            if (sp) {
                title = sp.title;
                amountShown = sp.amountText;
                if (trx.status === 'success') icon = sp.icon;
            }

            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="font-size:24px;">${icon}</div>
                    <div>
                        <div style="font-weight:bold; font-size:14px; margin-bottom:2px; line-height:1.2;">${title}</div>
                        <div style="font-size:11px; color:#888;">${new Date(trx.date).toLocaleString()}</div>
                        <div style="font-size:10px; color:#aaa; margin-top:2px;">#${trx.order_id}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:bold; color:var(--primary-color); font-size:14px;">${amountShown}</div>
                    <span class="status-badge ${badgeClass}" style="margin-top:5px; display:inline-block;">${statusLabel}</span>
                </div>
            `;
            container.appendChild(item);
        });
    } else {
        emptyState.style.display = 'flex';
    }
}

function openInvoice(trx) {
    // Simpan data trx ke sessionStorage untuk restore saat refresh
    sessionStorage.setItem('lastOpenedTrx', JSON.stringify(trx));

    // Gunakan halaman detail, bukan popup
    const el = (id) => document.getElementById(id);

    let itemName = (!trx.type || trx.type === 'deposit') ? 'Saldo Deposit' : 'Transaksi';
    const pName = (trx.product_data && trx.product_data.product_name) ? trx.product_data.product_name : '';

    if (trx.type === 'buy_panel') itemName = 'Panel ' + (pName || 'Sultan');
    else if (trx.type === 'buy_script') itemName = 'Script ' + (pName || 'Bot');
    else if (trx.type === 'buy_murid') itemName = 'Join Murid ' + (pName || 'Kelas');
    else if (trx.type === 'buy_vps') itemName = 'VPS ' + (pName || 'Server');
    else if (trx.type === 'buy_nokos') {
        const pdn = trx.product_data || {};
        itemName = 'Nokos ' + (pName || 'OTP') + (pdn.phone_number ? `\n(Nomor: ${pdn.phone_number})` : '') + (pdn.otp_code ? `\n(Kode OTP: ${pdn.otp_code})` : '');
    }
    else if (trx.type === 'buy_subdomain') {
        const ip = trx.product_data?.ip_address;
        itemName = 'Subdomain ' + (pName || '') + (ip ? `\n(IP: ${ip})` : '');
    }
    else if (trx.type === 'extend_panel') {
        const up = trx.product_data?.username_panel;
        itemName = (pName || 'Perpanjang Panel') + (up ? `\n(Panel: ${up})` : '');
    }
    else if (trx.type === 'transfer_qris' || trx.type === 'transfer_personal') {
        const rcp = trx.product_data?.recipient;
        itemName = rcp ? `Transfer QRIS ke @${rcp}` : 'Transfer QRIS';
    }
    else if (trx.type === 'buy_sosmed') itemName = 'SMM: ' + (pName || 'Layanan') + `\n(Target: ${trx.product_data?.target || '-'})`;
    else if (trx.type === 'buy_ewallet') {
        const target = trx.product_data?.target || '-';
        itemName = `${pName || 'Topup E-Wallet'}\n(Nomor: ${target})`;
    } else if (trx.type === 'buy_game') {
        const target = trx.product_data?.target || '-';
        itemName = `${pName || 'Topup Game'}\n(ID Player: ${target})`;
    } else if (trx.type === 'transfer_out') {
        const recipient = (trx.product_data && trx.product_data.recipient) ? trx.product_data.recipient : 'Seseorang';
        itemName = `Transfer Saldo ke @${recipient}`;
    } else if (trx.type === 'transfer_in') {
        const sender = (trx.product_data && trx.product_data.sender) ? trx.product_data.sender : 'Seseorang';
        itemName = `Terima Saldo dari @${sender}`;
    } else if (trx.type === 'buy_premium_app') {
        itemName = pName || 'Aplikasi Premium';
        const accs = (trx.product_data && trx.product_data.accounts) || [];
        if (trx.status === 'success' && accs.length > 0) {
            itemName += '\n\nData Akun:\n' + accs.map(a => `• ${a.username} / ${a.password}`).join('\n');
        } else if (trx.status === 'proses') {
            itemName += '\n(Status mengikuti server provider, akan otomatis update)';
        }
    }

    const sp = trxSpecial(trx);
    if (sp) itemName = sp.item;

    if (el('tdTotalLabel')) el('tdTotalLabel').innerText = sp ? sp.label : 'Total Bayar';
    if (el('tdOrderId')) el('tdOrderId').innerText = trx.order_id;
    if (el('tdDate')) el('tdDate').innerText = new Date(trx.date).toLocaleString();
    if (el('tdTotal')) el('tdTotal').innerText = sp ? sp.amountText : 'Rp ' + parseInt(trx.pay_amount).toLocaleString();
    if (el('tdItem')) el('tdItem').innerText = itemName;

    const statusEl = el('tdStatus');
    const headerEl = el('tdHeader');
    const titleEl = el('tdStatusTitle');
    const iconBg = el('tdIconBg');
    const iconEl = el('tdIcon');
    const actionPending = el('tdActionPending');
    const actionExpired = el('tdActionExpired');

    if (actionPending) actionPending.style.display = 'none';
    if (actionExpired) actionExpired.style.display = 'none';

    if (trx.status === 'success') {
        if (statusEl) { statusEl.innerText = 'BERHASIL'; statusEl.style.color = '#2ecc71'; }
        if (headerEl) headerEl.style.background = '#2ecc71';
        if (titleEl) titleEl.innerText = sp ? sp.header : 'Transaksi Berhasil';
        if (iconEl) iconEl.className = 'fas fa-check';
    } else if (trx.status === 'pending') {
        if (statusEl) { statusEl.innerText = 'MENUNGGU PEMBAYARAN'; statusEl.style.color = '#e67e22'; }
        if (headerEl) headerEl.style.background = '#e67e22';
        if (titleEl) titleEl.innerText = 'Menunggu Pembayaran';
        if (iconEl) iconEl.className = 'fas fa-hourglass-half';
        if (actionPending) {
            actionPending.style.display = 'block';
            const btnLanjut = el('tdBtnLanjutBayar');
            if (btnLanjut) {
                btnLanjut.innerText = 'LANJUT BAYAR';
                btnLanjut.onclick = () => continuePayment(trx);
            }
        }
    } else if (trx.status === 'proses') {
        if (statusEl) { statusEl.innerText = 'SEDANG DIPROSES'; statusEl.style.color = '#3498db'; }
        if (headerEl) headerEl.style.background = '#3498db';
        if (titleEl) titleEl.innerText = 'Transaksi Diproses';
        if (iconEl) iconEl.className = 'fas fa-spinner fa-spin';
    } else {
        const label = trx.status === 'expired' ? 'KADALUARSA' : 'DIBATALKAN';
        if (statusEl) { statusEl.innerText = label; statusEl.style.color = '#e74c3c'; }
        if (headerEl) headerEl.style.background = '#e74c3c';
        if (titleEl) titleEl.innerText = 'Transaksi ' + (trx.status === 'expired' ? 'Kadaluarsa' : 'Gagal');
        if (iconEl) iconEl.className = 'fas fa-times';
        if (trx.status === 'expired' && actionExpired) actionExpired.style.display = 'block';
    }

    switchPage('transaksi-detail');

    }

function continuePayment(trx) {
    const createdTime = new Date(trx.date).getTime();
    const expireTime = createdTime + (5 * 60 * 1000);
    const now = Date.now();

    if (now > expireTime) {
        showCustomAlert("Waktu pembayaran telah habis.", "Kadaluarsa");
        invoiceModal.classList.remove('show');
        loadHistory();
        return;
    }

    let panelUser = null;
    let prodName = null;

    if (trx.type === 'buy_panel' && trx.product_data) {
        panelUser = trx.product_data.username_panel;
    }
    if (trx.type === 'buy_script' && trx.product_data) {
        prodName = trx.product_data.product_name;
    }
    if (trx.type === 'buy_murid' && trx.product_data) {
        prodName = trx.product_data.product_name;
    }

    localStorage.setItem('pendingTrx', JSON.stringify({
        order_id: trx.order_id,
        pay_amount: trx.pay_amount,
        deposit_amount: trx.amount,
        qr_string: trx.qr_string,
        expire_at: expireTime,
        username: trx.username || (JSON.parse(localStorage.getItem('user')) || {}).username || 'Guest',
        trx_type: trx.type,
        username_panel: panelUser,
        product_name: prodName
    }));
    window.location.href = '/payment';
}

// ============ AKTIVITAS PUBLIK ============
async function checkPublicActivity(isFirstLoad = false) {
    try {
        const res = await fetch('/api/public/activity');
        const json = await res.json();

        if (json.success && json.data.length > 0) {
            activityData = json.data;
            localStorage.setItem('cachedActivityData', JSON.stringify(activityData));
            const newest = activityData[0];
            const savedLatestId = localStorage.getItem('latestActivityId');

            updateInfoTabsRedDots();

            const readList = JSON.parse(localStorage.getItem('read_items') || '[]');
            const hasUnread = activityData.some(item => !readList.includes(item.id));
            const bellBadge = document.getElementById('infoBadge');
            const bellIcon = document.querySelector('.nav-item[data-target="info"] i');

            if (hasUnread && !isInfoMenuOpened) {
                if (bellBadge) bellBadge.classList.add('show');
                if (bellIcon) bellIcon.classList.add('shake-bell');
            } else {
                if (bellBadge) bellBadge.classList.remove('show');
                if (bellIcon) bellIcon.classList.remove('shake-bell');
            }

            if (isFirstLoad || newest.id !== savedLatestId) {
                const isBigPopupOpen = document.querySelector('.swal2-popup:not(.swal2-toast)');
                
                if (!isBigPopupOpen) {
                    let fresh = [];
                    if (isFirstLoad || !savedLatestId) {
                        fresh = [newest];
                    } else {
                        const idx = activityData.findIndex(it => it.id === savedLatestId);
                        fresh = [newest]; // cukup 1 notif terbaru (tidak spam)
                    }
                    fresh.forEach((it, i) => setTimeout(() => showToastNotification(it), i * 350));
                }
                localStorage.setItem('latestActivityId', newest.id);
            }
        }
    } catch (e) {
        console.log("Gagal cek aktivitas");
    }
}

function showToastNotification(item) {
    if (window.RM_IS_APP) { // di APK cukup notif order saja
        const _t = String((item && item.trx_type) || '');
        if (!item || item.type !== 'transaction' || _t === 'deposit' || _t.includes('transfer')) return;
    }
    let msg = "";
    let icon = "success";

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const myUsername = user.username || '';

    if (item.type === 'transaction') {
        if (item.trx_type && item.trx_type.includes('transfer')) {
            let sender = item.name;
            let rawDesc = item.desc;

            let recipientMatch = rawDesc.match(/@([a-zA-Z0-9_]+)/);
            let recipient = recipientMatch ? recipientMatch[1] : 'seseorang';
            let amountMatch = rawDesc.match(/Rp\s*([0-9.,]+)/i);
            let amountStr = amountMatch ? `Rp ${amountMatch[1]}` : 'Uang';

            if (myUsername && (myUsername === recipient || myUsername === sender)) {
                return; // notif pribadi (dana masuk / transfer berhasil) cukup lewat notif APK
            } else {
                msg = `<i class="fas fa-money-bill-transfer"></i> <b>@${sender}</b> transfer ${amountStr} ke <b>@${recipient}</b>`;
            }
        } else {
            let action = "order";
            if (item.trx_type === 'deposit') action = "deposit";
            else if (item.trx_type === 'buy_game' || item.trx_type === 'buy_ewallet') action = "topup";
            else if (item.trx_type === 'extend_panel') action = "melakukan";

            let product = item.desc;
            if (item.trx_type === 'deposit') product = String(product).replace(/^\s*deposit\s*/i, ''); // biar tidak "deposit Deposit Rp ..."

            const maxLen = item.trx_type === 'buy_nokos' ? 34 : 20;
            if (product.length > maxLen) product = product.substring(0, maxLen) + "..";

            if (item.trx_type === 'buy_premium_app') {
                // Notif khusus Aplikasi Premium: warna oren, AM disingkat
                msg = `<b>${item.name}</b> order <span style="color:#f97316; font-weight:bold;">${product}</span>`;
            } else {
                msg = `<b>${item.name}</b> ${action} <b>${product}</b>`;
            }
        }
    } else {
        msg = item.desc.length > 40 ? item.desc.substring(0, 40) + "..." : item.desc;
        icon = 'info';
    }

    rmShowStackToast({ html: msg, icon: icon === 'info' ? 'info' : 'success', duration: 4500 });
}

// ============ PROMO ============
function getCurrentPage() {
    const activePage = document.querySelector('.page-section.active');
    if (!activePage) return null;
    return activePage.id.replace('page-', '');
}

function resetPromo(page) {
    if (!page) page = getCurrentPage();
    if (!page) return;

    appliedPromo[page] = null;

    const prefix = page === 'panel' ? 'Panel' :
        page === 'script' ? 'Script' :
        page === 'murid' ? 'Murid' :
        page === 'vps' ? 'VPS' :
        page === 'sosmed' ? 'Sosmed' :
        page === 'subdomain' ? 'Sub' :
        page === 'game' ? 'Game' :
        page === 'game-ml' ? 'GameML' :
        page === 'ewallet' ? 'Ewallet' :
        page === 'ewallet-gd' ? 'EwalletGD' :
        page === 'ewallet-gopay' ? 'EwalletGopay' :
        page === 'ewallet-ovo' ? 'Ovo' :
        page === 'ewallet-shopee' ? 'Shopee' :
        page === 'ewallet-linkaja' ? 'Linkaja' :
        page === 'ewallet-astrapay' ? 'Astrapay' :
        page === 'ewallet-isaku' ? 'Isaku' :
        page === 'ewallet-kaspro' ? 'Kaspro' : 
        page === 'bebas' ? 'Bebas' : '';

    const codeInput = document.getElementById(`promoCode${prefix}`);
    const resultDiv = document.getElementById(`promoResult${prefix}`);
    const discountDiv = document.getElementById(`discountInfo${prefix}`);

    if (codeInput) codeInput.value = '';
    if (resultDiv) {
        resultDiv.style.display = 'none';
        resultDiv.innerHTML = '';
    }
    if (discountDiv) discountDiv.style.display = 'none';
}
function setupPromoListeners() {
    const pages = ['panel', 'script', 'murid', 'vps', 'sosmed', 'subdomain', 'game', 'game-ml', 'ewallet', 'ewallet-gd', 'ewallet-gopay', 'ewallet-ovo', 'ewallet-shopee', 'ewallet-linkaja', 'ewallet-astrapay', 'ewallet-isaku', 'ewallet-kaspro', 'bebas'];

    pages.forEach(page => {
        // PERBAIKAN DI SINI: Tambahkan "const prefix =" agar tidak error
        const prefix = page === 'panel' ? 'Panel' :
            page === 'script' ? 'Script' :
            page === 'murid' ? 'Murid' :
            page === 'vps' ? 'VPS' :
            page === 'sosmed' ? 'Sosmed' :
            page === 'subdomain' ? 'Sub' :
            page === 'game' ? 'Game' :
            page === 'game-ml' ? 'GameML' :
            page === 'ewallet' ? 'Ewallet' :
            page === 'ewallet-gd' ? 'EwalletGD' :
            page === 'ewallet-gopay' ? 'EwalletGopay' :
            page === 'ewallet-ovo' ? 'Ovo' :
            page === 'ewallet-shopee' ? 'Shopee' :
            page === 'ewallet-linkaja' ? 'Linkaja' :
            page === 'ewallet-astrapay' ? 'Astrapay' :
            page === 'ewallet-isaku' ? 'Isaku' :
            page === 'ewallet-kaspro' ? 'Kaspro' : 
            page === 'bebas' ? 'Bebas' : '';

        const btn = document.getElementById(`btnApplyPromo${prefix}`);
        const input = document.getElementById(`promoCode${prefix}`);

        if (btn && input) {
            btn.replaceWith(btn.cloneNode(true));
            const newBtn = document.getElementById(`btnApplyPromo${prefix}`);

            newBtn.addEventListener('click', async function(e) {
                e.preventDefault();

                const code = input.value.trim().toUpperCase();
                if (!code) {
                    showPromoResult(page, 'Masukkan kode promo', 'error');
                    return;
                }

                let price = 0;
                let productCode = '';
                let category = page;

                if (page === 'panel') {
                    price = selectedPrice;
                    productCode = selectedProductCode;
                } else if (page === 'script') {
                    price = selectedScriptPrice;
                    productCode = selectedScriptCode;
                } else if (page === 'murid') {
                    price = selectedMuridPrice;
                    productCode = selectedMuridCode;
                } else if (page === 'vps') {
                    price = selectedVPSPrice;
                    productCode = selectedVPSCode;
                } else if (page === 'sosmed') {
                    price = parseInt(document.getElementById('footerPriceSosmed').innerText.replace(/[^0-9]/g, '')) || 0;
                    productCode = selectedSosmedService ? selectedSosmedService.id : '';
                } else if (page === 'subdomain') {
                    price = selectedZone ? selectedZone.price : 0;
                    productCode = selectedZone ? selectedZone.id : '';
                } else if (page === 'game') {
                    price = selectedGamePrice;
                    productCode = selectedGameCode;
                } else if (page === 'game-ml') {
                    price = selectedMLPrice || selectedMLMembershipPrice || 0;
                    productCode = selectedMLCode || selectedMLMembershipCode || '';
                } else if (page === 'ewallet') {
                    price = selectedEwalletPrice;
                    productCode = selectedEwalletCode;
                } else if (page === 'ewallet-gd') {
                    price = selectedEwalletPriceGD;
                    productCode = selectedEwalletCodeGD;
                } else if (page === 'ewallet-gopay') {
                    price = selectedEwalletPriceGopay;
                    productCode = selectedEwalletCodeGopay;
                } else if (page === 'ewallet-ovo') {
                    price = selectedOvoPrice;
                    productCode = selectedOvoCode;
                } else if (page === 'ewallet-shopee') {
                    price = selectedShopeePrice;
                    productCode = selectedShopeeCode;
                } else if (page === 'ewallet-linkaja') {
                    price = selectedLinkajaPrice;
                    productCode = selectedLinkajaCode;
                } else if (page === 'ewallet-astrapay') {
                    price = selectedAstrapayPrice;
                    productCode = selectedAstrapayCode;
                } else if (page === 'ewallet-isaku') {
                    price = selectedIsakuPrice;
                    productCode = selectedIsakuCode;
                } else if (page === 'ewallet-kaspro') {
                    price = selectedKasproPrice;
                    productCode = selectedKasproCode;
                }

                if (price <= 0) {
                    showPromoResult(page, 'Pilih produk terlebih dahulu', 'error');
                    return;
                }

                originalPrice[page] = price;

                newBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                newBtn.disabled = true;

                await checkPromoAPI(page, code, category, productCode, price, prefix);

                newBtn.innerHTML = 'CEK';
                newBtn.disabled = false;
            });

            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    newBtn.click();
                }
            });
        }
    });
}

async function checkPromoAPI(page, code, category, productCode, price, prefix) {
    const { token } = checkLogin();
    if (!token) {
        showPromoResult(page, 'Silakan login terlebih dahulu', 'error');
        return;
    }

    try {
        const res = await fetch('/api/check-promo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                code,
                category,
                product_code: productCode,
                amount: price
            })
        });

        const data = await res.json();

        if (data.success) {
            appliedPromo[page] = data.promo;

            showPromoResult(page, `${data.promo.name || 'Promo'}: Diskon Rp ${data.promo.discount_amount.toLocaleString()}`, 'success');

            const discountAmountEl = document.getElementById(`discountAmount${prefix}`);
            const finalPriceEl = document.getElementById(`finalPrice${prefix}`);
            const discountDiv = document.getElementById(`discountInfo${prefix}`);

            if (discountAmountEl) discountAmountEl.innerText = `- Rp ${data.promo.discount_amount.toLocaleString()}`;
            if (finalPriceEl) finalPriceEl.innerText = `Rp ${data.promo.final_amount.toLocaleString()}`;
            if (discountDiv) discountDiv.style.display = 'block';

            updateFooterPriceByPage(page, data.promo.final_amount);

        } else {
            appliedPromo[page] = null;
            showPromoResult(page, data.message, 'error');

            const discountDiv = document.getElementById(`discountInfo${prefix}`);
            if (discountDiv) discountDiv.style.display = 'none';

            updateFooterPriceByPage(page, originalPrice[page]);
        }

    } catch (e) {
        console.log('Promo API Error:', e);
        showPromoResult(page, 'Gagal terhubung ke server', 'error');
    }
}

function showPromoResult(page, message, type) {
    const prefix = page === 'panel' ? 'Panel' :
        page === 'script' ? 'Script' :
        page === 'murid' ? 'Murid' :
        page === 'vps' ? 'VPS' :
        page === 'sosmed' ? 'Sosmed' :
        page === 'subdomain' ? 'Sub' :
        page === 'game' ? 'Game' :
        page === 'game-ml' ? 'GameML' :
        page === 'ewallet' ? 'Ewallet' :
        page === 'ewallet-gd' ? 'EwalletGD' :
        page === 'ewallet-gopay' ? 'EwalletGopay' :
        page === 'ewallet-ovo' ? 'Ovo' :
        page === 'ewallet-shopee' ? 'Shopee' :
        page === 'ewallet-linkaja' ? 'Linkaja' :
        page === 'ewallet-astrapay' ? 'Astrapay' :
        page === 'ewallet-isaku' ? 'Isaku' :
        page === 'ewallet-kaspro' ? 'Kaspro' : '';

    const resultDiv = document.getElementById(`promoResult${prefix}`);
    if (!resultDiv) return;

    resultDiv.style.display = 'flex';
    resultDiv.className = `promo-result ${type}`;

    if (type === 'success') {
        resultDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    } else {
        resultDiv.innerHTML = `<i class="fas fa-times-circle"></i> ${message}`;
    }

    if (type === 'success') {
        setTimeout(() => {
            if (resultDiv) resultDiv.style.display = 'none';
        }, 5000);
    }
}
function updateFooterPriceByPage(page, price) {
    // Kalau popup Rincian lagi kebuka pas promo diterapin, ikut update totalnya juga
    const modalTotalEl = document.querySelector(`.confirm-modal-overlay.show [data-total-for="${page}"]`);
    if (modalTotalEl) modalTotalEl.innerText = 'Rp ' + price.toLocaleString();

    if (page === 'panel') {
        document.getElementById('footerPrice').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'script') {
        document.getElementById('footerPriceScript').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'murid') {
        document.getElementById('footerPriceMurid').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'vps') {
        document.getElementById('footerPriceVPS').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'sosmed') {
        document.getElementById('footerPriceSosmed').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'subdomain') {
        document.getElementById('footerPriceSub').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'game') {
        document.getElementById('footerPriceGame').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'game-ml') {
        document.getElementById('footerPriceGameML').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'ewallet') {
        document.getElementById('footerPriceEwallet').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'ewallet-gd') {
        document.getElementById('footerPriceEwalletGD').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'ewallet-gopay') {
        document.getElementById('footerPriceEwalletGopay').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'ewallet-ovo') {
        document.getElementById('footerPriceOvo').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'ewallet-shopee') {
        document.getElementById('footerPriceShopee').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'ewallet-linkaja') {
        document.getElementById('footerPriceLinkaja').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'ewallet-astrapay') {
        document.getElementById('footerPriceAstrapay').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'ewallet-isaku') {
        document.getElementById('footerPriceIsaku').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'ewallet-kaspro') {
        document.getElementById('footerPriceKaspro').innerText = 'Rp ' + price.toLocaleString();
    } else if (page === 'bebas') {
        document.getElementById('footerPriceBebas').innerText = 'Rp ' + price.toLocaleString();
    }
}

function getFinalPriceByPage(page) {
    if (appliedPromo[page]) {
        return appliedPromo[page].final_amount;
    }

    if (page === 'panel') return selectedPrice;
    if (page === 'script') return selectedScriptPrice;
    if (page === 'murid') return selectedMuridPrice;
    if (page === 'vps') return selectedVPSPrice;
    if (page === 'sosmed') {
        const priceText = document.getElementById('footerPriceSosmed').innerText;
        return parseInt(priceText.replace(/[^0-9]/g, '')) || 0;
    }
    if (page === 'subdomain') return selectedZone ? selectedZone.price : 0;
    if (page === 'game') return selectedGamePrice;
    if (page === 'game-ml') return selectedMLPrice || selectedMLMembershipPrice || 0;
    if (page === 'ewallet') return selectedEwalletPrice;
    if (page === 'ewallet-gd') return selectedEwalletPriceGD;
    if (page === 'ewallet-gopay') return selectedEwalletPriceGopay;
    if (page === 'ewallet-ovo') return selectedOvoPrice;
    if (page === 'ewallet-shopee') return selectedShopeePrice;
    if (page === 'ewallet-linkaja') return selectedLinkajaPrice;
    if (page === 'ewallet-astrapay') return selectedAstrapayPrice;
    if (page === 'ewallet-isaku') return selectedIsakuPrice;
    if (page === 'ewallet-kaspro') return selectedKasproPrice;
    if (page === 'bebas') return selectedBebasTotal;

    return 0;
}

function getPromoDataByPage(page) {
    if (appliedPromo[page]) {
        return {
            code: appliedPromo[page].code,
            discount_amount: appliedPromo[page].discount_amount
        };
    }
    return null;
}

// ============ SIDEBAR MENU ============
function setupSidebarMenus() {
    const menuKelas = document.getElementById('menuKelasSaya');
    const modalKelas = document.getElementById('kelasModal');
    const contentKelas = document.getElementById('popupKelasContent');
    const btnCloseKelas = document.getElementById('btnCloseKelas');

    if (menuKelas) {
        menuKelas.addEventListener('click', async () => {
            closeSidebar();

            const { token } = checkLogin();
            if (!token) {
                Swal.fire('Login Dulu', 'Silakan login untuk mengakses halaman ini.', 'warning');
                return;
            }

            modalKelas.classList.add('show');
            contentKelas.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Memuat Data...</div>';

            try {
                const res = await fetch('/api/get-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const d = await res.json();

                if (d.success && d.user.joined_murid && d.user.joined_murid.length > 0) {
                    let html = '<div class="panel-scroll-container">';

                    d.user.joined_murid.forEach(m => {
                        const groupLink = m.link || "https://wa.me/6281234567890?text=Min+minta+link+grup";

                        html += `
                            <div class="panel-card-item">
                                <div class="panel-card-header">
                                    <span style="font-weight:bold; color:var(--primary-color); font-size:13px;">${m.name}</span>
                                    <span style="font-size:10px; background:#2ecc71; color:white; padding:2px 6px; border-radius:4px;">AKTIF</span>
                                </div>
                                <div style="font-size:11px; color:#666; margin-bottom:15px;">
                                    Bergabung: ${new Date(m.date).toLocaleDateString('id-ID')}
                                </div>
                                <div style="background:#e3f2fd; padding:10px; border-radius:8px; font-size:12px; color:#1565c0; text-align:center; border:1px dashed #2196f3;">
                                    Silakan klik tombol di bawah untuk masuk ke grup mentoring.
                                </div>
                                
                                <a href="${groupLink}" target="_blank" style="margin-top:10px; background:#2980b9; color:white; text-decoration:none; padding:12px; border-radius:8px; display:flex; align-items:center; justify-content:center; gap:8px; font-weight:bold; font-size:13px; box-shadow:0 4px 6px rgba(41, 128, 185, 0.2);">
                                    <i class="fas fa-users"></i> GABUNG GRUP
                                </a>
                            </div>
                         `;
                    });

                    html += '</div>';
                    contentKelas.innerHTML = html;
                } else {
                    contentKelas.innerHTML = `
                        <div style="text-align:center; padding:30px; color:#888;">
                            <i class="fas fa-user-graduate" style="font-size:40px; margin-bottom:10px; color:#ddd;"></i>
                            <p>Anda belum bergabung di kelas apapun.</p>
                            <button onclick="document.getElementById('kelasModal').classList.remove('show'); switchPage('murid');" 
                                    style="margin-top:10px; background:var(--primary-color); color:white; border:none; padding:10px 20px; border-radius:20px; cursor:pointer; font-weight:bold;">
                                <i class="fas fa-plus"></i> Gabung Sekarang
                            </button>
                        </div>
                    `;
                }
            } catch (e) {
                contentKelas.innerHTML = 'Gagal memuat data.';
            }
        });
    }

    if (btnCloseKelas) btnCloseKelas.addEventListener('click', () => modalKelas.classList.remove('show'));
    if (modalKelas) modalKelas.addEventListener('click', (e) => { if (e.target === modalKelas) modalKelas.classList.remove('show'); });

    const menuDownload = document.getElementById('menuDownloadScript');
    const modalDownload = document.getElementById('scriptDownloadModal');
    const contentDownload = document.getElementById('popupScriptContent');
    const btnCloseDownload = document.getElementById('btnCloseScriptDownload');

    if (menuDownload) {
        menuDownload.addEventListener('click', async () => {
            closeSidebar();

            const { token } = checkLogin();
            if (!token) {
                Swal.fire('Login Dulu', 'Silakan login untuk mengakses halaman ini.', 'warning');
                return;
            }

            modalDownload.classList.add('show');
            contentDownload.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Memuat Data...</div>';

            try {
                const res = await fetch('/api/get-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const d = await res.json();

                if (d.success && d.user.purchased_scripts && d.user.purchased_scripts.length > 0) {
                    let html = '<div class="panel-scroll-container">';

                    d.user.purchased_scripts.forEach(s => {
                        html += `
                            <div class="panel-card-item">
                                <div class="panel-card-header">
                                    <span style="font-weight:bold; color:var(--primary-color); font-size:13px;">${s.name}</span>
                                    <span style="font-size:10px; background:#2ecc71; color:white; padding:2px 6px; border-radius:4px;">OWNED</span>
                                </div>
                                <div style="font-size:11px; color:#666; margin-bottom:15px;">
                                    Dibeli pada: ${new Date(s.date).toLocaleDateString('id-ID')}
                                </div>
                                <a href="${s.link}" target="_blank" style="background:#3498db; color:white; text-decoration:none; padding:10px; border-radius:8px; display:block; text-align:center; font-weight:bold; font-size:12px;">
                                    <i class="fas fa-download"></i> DOWNLOAD SCRIPT
                                </a>
                            </div>
                         `;
                    });

                    html += '</div>';
                    contentDownload.innerHTML = html;
                } else {
                    contentDownload.innerHTML = `
                        <div style="text-align:center; padding:30px; color:#888;">
                            <i class="fas fa-file-code" style="font-size:40px; margin-bottom:10px; color:#ddd;"></i>
                            <p>Anda belum memiliki Script apapun.</p>
                            <button onclick="document.getElementById('scriptDownloadModal').classList.remove('show'); switchPage('script');" 
                                    style="margin-top:10px; background:var(--primary-color); color:white; border:none; padding:10px 20px; border-radius:20px; cursor:pointer; font-weight:bold;">
                                <i class="fas fa-shopping-cart"></i> Beli Sekarang
                            </button>
                        </div>
                    `;
                }
            } catch (e) {
                contentDownload.innerHTML = 'Gagal memuat.';
            }
        });
    }

    if (btnCloseDownload) btnCloseDownload.addEventListener('click', () => modalDownload.classList.remove('show'));
    if (modalDownload) modalDownload.addEventListener('click', (e) => { if (e.target === modalDownload) modalDownload.classList.remove('show'); });

    const menuAkunPremium = document.getElementById('menuAkunPremium');
    const premiumAccPopupModal = document.getElementById('premiumAccPopupModal');
    const btnClosePremiumAccPopup = document.getElementById('btnClosePremiumAccPopup');
    const popupPremiumAccContent = document.getElementById('popupPremiumAccContent');

    if (menuAkunPremium) {
        menuAkunPremium.addEventListener('click', async () => {
            closeSidebar();
            const { token } = checkLogin();
            if (!token) {
                Swal.fire('Login Dulu', 'Silakan login untuk melihat akun premium.', 'warning');
                return;
            }
            if (premiumAccPopupModal) premiumAccPopupModal.classList.add('show');
            popupPremiumAccContent.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Memuat Data...</div>';

            try {
                const res = await fetch('/api/my-premium-accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const d = await res.json();

                if (d.success && d.data && d.data.length > 0) {
                    popupPremiumAccContent.innerHTML = d.data.map(item => {
                        let statusBadge = item.status === 'success'
                            ? '<span style="color:#2ecc71;font-weight:bold;font-size:11px;"><i class="fas fa-check-circle"></i> SUKSES</span>'
                            : item.status === 'proses'
                            ? '<span style="color:#f97316;font-weight:bold;font-size:11px;"><i class="fas fa-clock"></i> DIPROSES</span>'
                            : '<span style="color:#e74c3c;font-weight:bold;font-size:11px;"><i class="fas fa-circle-xmark"></i> GAGAL</span>';

                        let accHtml = (item.accounts || []).map(a => {
                            const uname = escapeHtml(a.username || '-');
                            const pass = escapeHtml(a.password || '-');
                            return `
                            <div style="background:var(--bg); border-radius:8px; padding:10px; margin-top:6px; font-size:12px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                                    <div style="word-break:break-all;"><b>Username:</b> ${uname}</div>
                                    <button type="button" data-copyval="${uname}" onclick="copyToClipboard(this.dataset.copyval)" title="Salin Username" style="flex-shrink:0; background:var(--card-bg,#fff); border:1px solid var(--border-color); border-radius:6px; padding:4px 9px; cursor:pointer; color:var(--text-main);"><i class="fas fa-copy"></i></button>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:6px;">
                                    <div style="word-break:break-all;"><b>Password:</b> ${pass}</div>
                                    <button type="button" data-copyval="${pass}" onclick="copyToClipboard(this.dataset.copyval)" title="Salin Password" style="flex-shrink:0; background:var(--card-bg,#fff); border:1px solid var(--border-color); border-radius:6px; padding:4px 9px; cursor:pointer; color:var(--text-main);"><i class="fas fa-copy"></i></button>
                                </div>
                            </div>`;
                        }).join('');

                        return `
                        <div style="border:1px solid var(--border-color); border-radius:10px; padding:12px; margin-bottom:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-weight:bold; font-size:13px;">${item.product_name}</span>
                                ${statusBadge}
                            </div>
                            <div style="font-size:11px; color:var(--text-sub); margin-top:2px;">${new Date(item.date).toLocaleString('id-ID')}</div>
                            ${accHtml || '<div style="font-size:12px; color:var(--text-sub); margin-top:6px;">Belum ada data akun.</div>'}
                        </div>`;
                    }).join('');
                } else {
                    popupPremiumAccContent.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">Belum ada akun premium yang dibeli.</div>';
                }
            } catch (e) {
                popupPremiumAccContent.innerHTML = '<div style="text-align:center; color:#e74c3c; padding:20px;">Gagal memuat data.</div>';
            }
        });
    }
    if (btnClosePremiumAccPopup) btnClosePremiumAccPopup.addEventListener('click', () => premiumAccPopupModal.classList.remove('show'));
    if (premiumAccPopupModal) premiumAccPopupModal.addEventListener('click', (e) => { if (e.target === premiumAccPopupModal) premiumAccPopupModal.classList.remove('show'); });

    const menuPanel = document.getElementById('menuPanelPopup');
    const btnClosePanel = document.getElementById('btnClosePanelPopup');
    const panelContent = document.getElementById('popupPanelContent');

    if (menuPanel) {
        menuPanel.addEventListener('click', async () => {
            closeSidebar();
            const { token } = checkLogin();
            if (!token) {
                Swal.fire('Login Dulu', 'Silakan login untuk melihat panel.', 'warning');
                return;
            }

            if (panelPopupModal) panelPopupModal.classList.add('show');
            panelContent.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Memuat Data...</div>';

            try {
                const res = await fetch('/api/get-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const d = await res.json();

                if (d.success && d.user.panels && d.user.panels.length > 0) {
                    let html = '<div class="panel-scroll-container">';

                    html += `
                        <div class="panel-card-item" style="justify-content:center; align-items:center; background:#fff0f0; border:1px dashed #e74c3c;">
                            <i class="fas fa-shield-alt" style="font-size:30px; color:#e74c3c; margin-bottom:10px;"></i>
                            <h4 style="font-size:14px; color:#c0392b; margin:0;">Klaim Garansi</h4>
                            <p style="font-size:10px; color:#555; text-align:center; margin:5px 0 10px 0;">Panel mati? Gunakan kode garansi Anda.</p>
                            <button onclick="openClaimModal()" style="background:#e74c3c; color:white; border:none; padding:8px 15px; border-radius:20px; font-size:12px; cursor:pointer; font-weight:bold;">
                               <i class="fas fa-tools"></i> Klaim Sekarang
                            </button>
                        </div>
                    `;

                    d.user.panels.forEach(p => {
                        let statusColor = '#2ecc71';
                        let statusText = 'AKTIF';

                        if (p.status === 'suspended') {
                            statusColor = '#f39c12';
                            statusText = 'SUSPEND';
                        }
                        if (p.status === 'deleted') {
                            statusColor = '#e74c3c';
                            statusText = 'DELETED';
                        }

                        const ram = p.spec ? p.spec.ram : '?';
                        const cpu = p.spec ? p.spec.cpu : '?';
                        const disk = p.spec ? p.spec.disk : '?';

                        // Tambahkan ID Server di teks copy
                        const copyText = `DATA PANEL ANDA\n\nUsername : ${p.username_panel}\nPassword : ${p.password_panel}\nLink Login : ${p.domain}\nID Server : ${p.uuid || '-'}\nKode Garansi : ${p.warranty_code}\n\nSPESIFIKASI\nRAM : ${ram}MB\nCPU : ${cpu}%\nDISK : ${disk}MB\n\nNote: Simpan kode garansi baik-baik.`;

                        html += `
                            <div class="panel-card-item">
                                <div class="panel-card-header">
                                    <span style="font-weight:bold; color:var(--primary-color); font-size:13px;">${p.product}</span>
                                    <span style="font-size:10px; background:${statusColor}; color:white; padding:2px 6px; border-radius:4px; font-weight:bold;">${statusText}</span>
                                </div>
                                
                                <div class="panel-label">Username</div>
                                <div class="panel-val">${p.username_panel}</div>
                                
                                <div class="panel-label">Password</div>
                                <div class="panel-val">${p.password_panel}</div>

                                <div class="panel-label">Login URL</div>
                                <div class="panel-val"><a href="${p.domain}" target="_blank" style="color:#3498db; text-decoration:none;">Buka Panel <i class="fas fa-external-link-alt" style="font-size:10px;"></i></a></div>

                                <div class="panel-label">ID Server (Untuk Perpanjang)</div>
                                <div class="panel-val highlight" style="background:#e3f2fd; color:#2980b9; padding:2px 5px; border-radius:3px; font-family:monospace; font-weight:bold;">${p.uuid || '-'}</div>

                                <div class="panel-label">Kode Garansi</div>
                                <div class="panel-val highlight" style="background:#f0f0f0; padding:2px 5px; border-radius:3px;">${p.warranty_code}</div>

                                <div class="panel-label">Spesifikasi</div>
                                <div class="panel-val" style="font-size:11px; color:#666;">RAM ${ram}MB | CPU ${cpu}% | DISK ${disk}MB</div>

                                <div class="panel-label">Egg</div>
                                <div class="panel-val" style="font-size:11px; color:#666;">${escapeEggHtml(p.egg_name || 'Default')}</div>
                                ${p.status === 'active' ? `<button class="btn-copy-panel" style="margin-top:6px; background:#8e44ad;" onclick="openChangeEggModal('${p.uuid}', '${escapeEggHtml(p.username_panel)}')"><i class="fas fa-exchange-alt"></i> GANTI EGG</button>` : ''}
                                
                                <div style="margin-top:10px; border-top:1px dashed #eee; padding-top:5px; font-size:10px; color:#666; display:flex; justify-content:space-between;">
                                    <span>Exp: ${new Date(p.expired_at).toLocaleDateString('id-ID')}</span>
                                </div>

                                <button class="btn-copy-panel" onclick="copyToClipboard(\`${copyText}\`)">
                                    <i class="fas fa-copy"></i> SALIN DATA LENGKAP
                                </button>
                            </div>
                        `;
                    });

                    html += '</div>';
                    html += '<div style="text-align:center; font-size:11px; color:#aaa; margin-top:10px;"><i class="fas fa-arrows-alt-h"></i> Geser ke samping untuk melihat panel lain</div>';

                    panelContent.innerHTML = html;
                } else {
                    panelContent.innerHTML = `
                        <div style="text-align:center; padding:30px; color:#888;">
                            <i class="fas fa-box-open" style="font-size:40px; margin-bottom:10px; color:#ddd;"></i>
                            <p>Anda belum memiliki layanan panel aktif.</p>
                            <button onclick="document.getElementById('panelPopupModal').classList.remove('show'); switchPage('panel');" 
                                    style="margin-top:10px; background:var(--primary-color); color:white; border:none; padding:10px 20px; border-radius:20px; cursor:pointer; font-weight:bold;">
                                <i class="fas fa-shopping-cart"></i> Beli Sekarang
                            </button>
                        </div>
                    `;
                }
            } catch (e) {
                console.error(e);
                panelContent.innerHTML = '<div style="text-align:center; color:#e74c3c; padding:20px;">Gagal memuat data. Periksa koneksi internet.</div>';
            }
        });
    }

    if (btnClosePanel) {
        btnClosePanel.addEventListener('click', () => {
            if (panelPopupModal) panelPopupModal.classList.remove('show');
        });
    }

    if (panelPopupModal) {
        panelPopupModal.addEventListener('click', (e) => {
            if (e.target === panelPopupModal) panelPopupModal.classList.remove('show');
        });
    }

    const menuSubdomain = document.getElementById('menuSubdomainSaya');
    const modalSubdomain = document.getElementById('modalSubdomainSaya');
    const contentSubdomain = document.getElementById('popupSubContent');
    const btnCloseSubList = document.getElementById('btnCloseSubList');

    if (menuSubdomain) {
        menuSubdomain.addEventListener('click', async () => {
            closeSidebar();
            const { token } = checkLogin();
            if (!token) return Swal.fire('Login', 'Silakan login dulu', 'warning');

            modalSubdomain.classList.add('show');
            contentSubdomain.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Memuat...</div>';

            try {
                const res = await fetch('/api/get-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const d = await res.json();

                if (d.success && d.user.purchased_subdomains && d.user.purchased_subdomains.length > 0) {
                    let html = '<div class="panel-scroll-container">';
                    d.user.purchased_subdomains.reverse().forEach(s => {
                        const copyText = `DATA SUBDOMAIN\nMain: ${s.domain}\nNode: ${s.node}\nIP: ${s.ip}`;

                        html += `
                            <div class="panel-card-item">
                                <div class="panel-card-header">
                                    <span style="font-weight:bold; color:#2980b9; font-size:13px;">${s.domain}</span>
                                    <span style="font-size:10px; background:#2ecc71; color:white; padding:2px 6px; border-radius:4px;">AKTIF</span>
                                </div>
                                
                                <div class="panel-label">IP Address</div>
                                <div class="panel-val">${s.ip}</div>

                                <div class="panel-label">Node (Wildcard/Random)</div>
                                <div class="panel-val">${s.node}</div>

                                <div style="margin-top:10px; font-size:9px; color:#999; text-align:right;">
                                    ${new Date(s.date).toLocaleDateString()}
                                </div>
                                
                                <button onclick="copySubdomainData('${s.domain}', '${s.node}', '${s.ip}')" style="width:100%; margin-top:10px; background:#333; color:white; border:none; padding:8px; border-radius:5px; font-size:11px; cursor:pointer;">
                                    <i class="fas fa-copy"></i> SALIN LENGKAP
                                </button>
                            </div>
                        `;
                    });
                    html += '</div>';
                    contentSubdomain.innerHTML = html;
                } else {
                    contentSubdomain.innerHTML = `<div style="text-align:center; padding:30px; color:#888;">Belum ada subdomain.</div>`;
                }
            } catch (e) {
                contentSubdomain.innerHTML = 'Gagal memuat.';
            }
        });
    }

    if (btnCloseSubList) btnCloseSubList.addEventListener('click', () => modalSubdomain.classList.remove('show'));
    
    document.getElementById('menuRiwayatSMM')?.addEventListener('click', () => {
        closeSidebar();
        const { token } = checkLogin();
        if (!token) return Swal.fire('Login', 'Silakan login dulu', 'warning');

        document.getElementById('modalRiwayatSMM').classList.add('show');
        loadRiwayatSMM();
    });

    document.getElementById('btnCloseRiwayatSMM')?.addEventListener('click', () => {
        document.getElementById('modalRiwayatSMM').classList.remove('show');
    });
}

// ============ FITUR RAHASIA ADMIN ============
const profileTrigger = document.querySelector('.profile-pic-container');
if (profileTrigger) {
    profileTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        secretTapCount++;
        if (secretTapCount === 1) {
            secretTapTimer = setTimeout(() => { secretTapCount = 0; }, 800);
        }
        if (secretTapCount >= 5) {
            clearTimeout(secretTapTimer);
            secretTapCount = 0;
            if (navigator.vibrate) navigator.vibrate(200);
            window.location.href = '/rahasia_admin_web';
        }
    });
}

// ============ OVO E-WALLET ============
async function fetchOvoProducts() {
    const grid = document.getElementById('ovoProductGrid');
    const loading = document.getElementById('ovoProductLoading');
    if (!grid || !loading) return;

    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const res = await fetch('/api/ewallet/products/ovo');
        const json = await res.json();

        loading.style.display = 'none';

        if (json.success && json.data.length > 0) {
            ovoProducts = json.data;
            renderOvoProducts();
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk / Kosong.</div>';
        }
    } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
    }
}

function renderOvoProducts() {
    const grid = document.getElementById('ovoProductGrid');
    grid.innerHTML = '';

    ovoProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectProductOvo(card, p);

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-money-bill-wave" style="font-size:24px; line-height:30px; height:30px; margin-bottom:5px; color:var(--primary-color);"></i>
                <span class="prod-name" style="font-size:12px;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectProductOvo(el, data) {
    document.querySelectorAll('#ovoProductGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedOvoCode = data.code;
    selectedOvoPrice = data.price;
    selectedOvoData = data;
    checkOrderOvo();
    resetPromo('ewallet-ovo');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('ewallet-ovo', 1);
}

async function checkOvoNumber() {
    await checkEwalletNumberGlobal('OVO');
}

function checkOvoInput() {
    const phone = document.getElementById('ovoPhone').value;
    if (phone.length >= 10) {
        if (!checkedOvoUser) {
            checkedOvoUser = { name: "Memuat...", number: phone };
        }
    } else {
        document.getElementById('ovoUserInfo').style.display = 'none';
        checkedOvoUser = null;
    }
    checkOrderOvo();
}

function resetOvoInputs() {
    document.getElementById('ovoPhone').value = '';
    document.getElementById('ovoUserInfo').style.display = 'none';
    checkedOvoUser = null;
    selectedOvoCode = null;
    selectedOvoPrice = 0;
    selectedOvoData = null;
    selectedMethodOvo = 'saldo';
    resetPromo('ewallet-ovo');
    checkOrderOvo();
}

function selectPayMethodOvo(method) {
    selectedMethodOvo = method;
    const nameElOvo = document.getElementById('metodeNameOvo');
    if (nameElOvo) nameElOvo.innerText = getMetodeLabel(method);
    const rincianNameElOvo = document.getElementById('rincianMetodeNameOvo');
    if (rincianNameElOvo) rincianNameElOvo.innerText = getMetodeLabel(method);
    checkOrderOvo();
}

function checkOrderOvo() {
    const btn = document.getElementById('btnBuyOvo');
    const footerPrice = document.getElementById('footerPriceOvo');
    const alert = document.getElementById('footerAlertOvo');

    footerPrice.innerText = 'Rp ' + (selectedOvoPrice || 0).toLocaleString();

    if (checkedOvoUser && selectedOvoCode && selectedMethodOvo) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';

        let msg = "Lengkapi data.";
        if (!checkedOvoUser) msg = "Masukkan nomor OVO yang valid (08xxxxxxxxxx).";
        else if (!selectedOvoCode) msg = "Pilih nominal topup.";
        else if (!selectedMethodOvo) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    }
}

// ============ SHOPEEPAY E-WALLET ============
async function fetchShopeeProducts() {
    const grid = document.getElementById('shopeeProductGrid');
    const loading = document.getElementById('shopeeProductLoading');
    if (!grid || !loading) return;

    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const res = await fetch('/api/ewallet/products/shopee');
        const json = await res.json();

        loading.style.display = 'none';

        if (json.success && json.data.length > 0) {
            shopeeProducts = json.data;
            renderShopeeProducts();
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk / Kosong.</div>';
        }
    } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
    }
}

function renderShopeeProducts() {
    const grid = document.getElementById('shopeeProductGrid');
    grid.innerHTML = '';

    shopeeProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        const badgeHTML = p.isAdmin ? `<div style="position:absolute; top:-5px; right:-5px; background:#ee4d2d; color:white; font-size:9px; padding:2px 5px; border-radius:5px; font-weight:bold;">ADMIN</div>` : '';
        card.onclick = () => selectProductShopee(card, p);

        card.innerHTML = `
            ${badgeHTML}
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center; position:relative;">
                <i class="fas fa-money-bill-wave" style="font-size:24px; line-height:30px; height:30px; margin-bottom:5px; color:var(--primary-color);"></i>
                <span class="prod-name" style="font-size:11px; text-align:center;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectProductShopee(el, data) {
    document.querySelectorAll('#shopeeProductGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedShopeeCode = data.code;
    selectedShopeePrice = data.price;
    selectedShopeeData = data;
    checkOrderShopee();
    resetPromo('ewallet-shopee');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('ewallet-shopee', 1);
}

async function checkShopeeNumber() {
    await checkEwalletNumberGlobal('SHOPEEPAY');
}

function checkShopeeInput() {
    const phone = document.getElementById('shopeePhone').value;
    if (phone.length >= 10) {
        checkedShopeeUser = { name: "Member ShopeePay", number: phone };
    } else {
        document.getElementById('shopeeUserInfo').style.display = 'none';
        checkedShopeeUser = null;
    }
    checkOrderShopee();
}

function resetShopeeInputs() {
    document.getElementById('shopeePhone').value = '';
    document.getElementById('shopeeUserInfo').style.display = 'none';
    checkedShopeeUser = null;
    selectedShopeeCode = null;
    selectedShopeePrice = 0;
    selectedShopeeData = null;
    selectedMethodShopee = 'saldo';
    resetPromo('ewallet-shopee');
    checkOrderShopee();
}

function selectPayMethodShopee(method) {
    selectedMethodShopee = method;
    const nameElShopee = document.getElementById('metodeNameShopee');
    if (nameElShopee) nameElShopee.innerText = getMetodeLabel(method);
    const rincianNameElShopee = document.getElementById('rincianMetodeNameShopee');
    if (rincianNameElShopee) rincianNameElShopee.innerText = getMetodeLabel(method);
    checkOrderShopee();
}

function checkOrderShopee() {
    const btn = document.getElementById('btnBuyShopee');
    const footerPrice = document.getElementById('footerPriceShopee');
    const alert = document.getElementById('footerAlertShopee');

    footerPrice.innerText = 'Rp ' + (selectedShopeePrice || 0).toLocaleString();

    if (checkedShopeeUser && selectedShopeeCode && selectedMethodShopee) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';

        let msg = "Lengkapi data.";
        if (!checkedShopeeUser) msg = "Masukkan nomor ShopeePay yang valid (08xxxxxxxxxx).";
        else if (!selectedShopeeCode) msg = "Pilih nominal topup.";
        else if (!selectedMethodShopee) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    }
}

// ============ LINKAJA E-WALLET ============
async function fetchLinkajaProducts() {
    const grid = document.getElementById('linkajaProductGrid');
    const loading = document.getElementById('linkajaProductLoading');
    if (!grid || !loading) return;

    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const res = await fetch('/api/ewallet/products/linkaja');
        const json = await res.json();

        loading.style.display = 'none';

        if (json.success && json.data.length > 0) {
            linkajaProducts = json.data;
            renderLinkajaProducts();
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk / Kosong.</div>';
        }
    } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
    }
}

function renderLinkajaProducts() {
    const grid = document.getElementById('linkajaProductGrid');
    grid.innerHTML = '';

    linkajaProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        const badgeHTML = p.isEntitas ? `<div style="position:absolute; top:-5px; right:-5px; background:#0055a0; color:white; font-size:9px; padding:2px 5px; border-radius:5px; font-weight:bold;">ENTITAS</div>` : '';
        card.onclick = () => selectProductLinkaja(card, p);

        card.innerHTML = `
            ${badgeHTML}
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center; position:relative;">
                <i class="fas fa-money-bill-wave" style="font-size:24px; line-height:30px; height:30px; margin-bottom:5px; color:var(--primary-color);"></i>
                <span class="prod-name" style="font-size:11px; text-align:center;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectProductLinkaja(el, data) {
    document.querySelectorAll('#linkajaProductGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedLinkajaCode = data.code;
    selectedLinkajaPrice = data.price;
    selectedLinkajaData = data;
    checkOrderLinkaja();
    resetPromo('ewallet-linkaja');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('ewallet-linkaja', 1);
}

async function checkLinkajaNumber() {
    await checkEwalletNumberGlobal('LINKAJA');
}

function checkLinkajaInput() {
    const phone = document.getElementById('linkajaPhone').value;
    if (phone.length >= 10) {
        if (!checkedLinkajaUser) {
            checkedLinkajaUser = { name: "Memuat...", number: phone };
        }
    } else {
        document.getElementById('linkajaUserInfo').style.display = 'none';
        checkedLinkajaUser = null;
    }
    checkOrderLinkaja();
}

function resetLinkajaInputs() {
    document.getElementById('linkajaPhone').value = '';
    document.getElementById('linkajaUserInfo').style.display = 'none';
    checkedLinkajaUser = null;
    selectedLinkajaCode = null;
    selectedLinkajaPrice = 0;
    selectedLinkajaData = null;
    selectedMethodLinkaja = 'saldo';
    resetPromo('ewallet-linkaja');
    checkOrderLinkaja();
}

function selectPayMethodLinkaja(method) {
    selectedMethodLinkaja = method;
    const nameElLinkaja = document.getElementById('metodeNameLinkaja');
    if (nameElLinkaja) nameElLinkaja.innerText = getMetodeLabel(method);
    const rincianNameElLinkaja = document.getElementById('rincianMetodeNameLinkaja');
    if (rincianNameElLinkaja) rincianNameElLinkaja.innerText = getMetodeLabel(method);
    checkOrderLinkaja();
}

function checkOrderLinkaja() {
    const btn = document.getElementById('btnBuyLinkaja');
    const footerPrice = document.getElementById('footerPriceLinkaja');
    const alert = document.getElementById('footerAlertLinkaja');

    footerPrice.innerText = 'Rp ' + (selectedLinkajaPrice || 0).toLocaleString();

    if (checkedLinkajaUser && selectedLinkajaCode && selectedMethodLinkaja) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';

        let msg = "Lengkapi data.";
        if (!checkedLinkajaUser) msg = "Masukkan nomor LinkAja yang valid (08xxxxxxxxxx).";
        else if (!selectedLinkajaCode) msg = "Pilih nominal topup.";
        else if (!selectedMethodLinkaja) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    }
}

// ============ ASTRAPAY E-WALLET ============
async function fetchAstrapayProducts() {
    const grid = document.getElementById('astrapayProductGrid');
    const loading = document.getElementById('astrapayProductLoading');
    if (!grid || !loading) return;

    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const res = await fetch('/api/ewallet/products/astrapay');
        const json = await res.json();

        loading.style.display = 'none';

        if (json.success && json.data.length > 0) {
            astrapayProducts = json.data;
            renderAstrapayProducts();
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk / Kosong.</div>';
        }
    } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
    }
}

function renderAstrapayProducts() {
    const grid = document.getElementById('astrapayProductGrid');
    grid.innerHTML = '';

    astrapayProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectProductAstrapay(card, p);

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-money-bill-wave" style="font-size:24px; line-height:30px; height:30px; margin-bottom:5px; color:var(--primary-color);"></i>
                <span class="prod-name" style="font-size:11px; text-align:center;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectProductAstrapay(el, data) {
    document.querySelectorAll('#astrapayProductGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedAstrapayCode = data.code;
    selectedAstrapayPrice = data.price;
    selectedAstrapayData = data;
    checkOrderAstrapay();
    resetPromo('ewallet-astrapay');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('ewallet-astrapay', 1);
}

async function checkAstrapayNumber() {
    await checkEwalletNumberGlobal('ASTRAPAY');
}

function checkAstrapayInput() {
    const phone = document.getElementById('astrapayPhone').value;
    if (phone.length >= 10) {
        if (!checkedAstrapayUser) {
            checkedAstrapayUser = { name: "Memuat...", number: phone };
        }
    } else {
        document.getElementById('astrapayUserInfo').style.display = 'none';
        checkedAstrapayUser = null;
    }
    checkOrderAstrapay();
}

function resetAstrapayInputs() {
    document.getElementById('astrapayPhone').value = '';
    document.getElementById('astrapayUserInfo').style.display = 'none';
    checkedAstrapayUser = null;
    selectedAstrapayCode = null;
    selectedAstrapayPrice = 0;
    selectedAstrapayData = null;
    selectedMethodAstrapay = 'saldo';
    resetPromo('ewallet-astrapay');
    checkOrderAstrapay();
}

function selectPayMethodAstrapay(method) {
    selectedMethodAstrapay = method;
    const nameElAstrapay = document.getElementById('metodeNameAstrapay');
    if (nameElAstrapay) nameElAstrapay.innerText = getMetodeLabel(method);
    const rincianNameElAstrapay = document.getElementById('rincianMetodeNameAstrapay');
    if (rincianNameElAstrapay) rincianNameElAstrapay.innerText = getMetodeLabel(method);
    checkOrderAstrapay();
}

function checkOrderAstrapay() {
    const btn = document.getElementById('btnBuyAstrapay');
    const footerPrice = document.getElementById('footerPriceAstrapay');
    const alert = document.getElementById('footerAlertAstrapay');

    footerPrice.innerText = 'Rp ' + (selectedAstrapayPrice || 0).toLocaleString();

    if (checkedAstrapayUser && selectedAstrapayCode && selectedMethodAstrapay) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';

        let msg = "Lengkapi data.";
        if (!checkedAstrapayUser) msg = "Masukkan nomor Astrapay yang valid (08xxxxxxxxxx).";
        else if (!selectedAstrapayCode) msg = "Pilih nominal topup.";
        else if (!selectedMethodAstrapay) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    }
}

// ============ ISAKU E-WALLET ============
async function fetchIsakuProducts() {
    const grid = document.getElementById('isakuProductGrid');
    const loading = document.getElementById('isakuProductLoading');
    if (!grid || !loading) return;

    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const res = await fetch('/api/ewallet/products/isaku');
        const json = await res.json();

        loading.style.display = 'none';

        if (json.success && json.data.length > 0) {
            isakuProducts = json.data;
            renderIsakuProducts();
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk / Kosong.</div>';
        }
    } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
    }
}

function renderIsakuProducts() {
    const grid = document.getElementById('isakuProductGrid');
    grid.innerHTML = '';

    isakuProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectProductIsaku(card, p);

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-money-bill-wave" style="font-size:24px; line-height:30px; height:30px; margin-bottom:5px; color:var(--primary-color);"></i>
                <span class="prod-name" style="font-size:11px; text-align:center;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectProductIsaku(el, data) {
    document.querySelectorAll('#isakuProductGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedIsakuCode = data.code;
    selectedIsakuPrice = data.price;
    selectedIsakuData = data;
    checkOrderIsaku();
    resetPromo('ewallet-isaku');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('ewallet-isaku', 1);
}

async function checkIsakuNumber() {
    await checkEwalletNumberGlobal('ISAKU');
}

function checkIsakuInput() {
    const phone = document.getElementById('isakuPhone').value;
    if (phone.length >= 10) {
        if (!checkedIsakuUser) {
            checkedIsakuUser = { name: "Memuat...", number: phone };
        }
    } else {
        document.getElementById('isakuUserInfo').style.display = 'none';
        checkedIsakuUser = null;
    }
    checkOrderIsaku();
}

function resetIsakuInputs() {
    document.getElementById('isakuPhone').value = '';
    document.getElementById('isakuUserInfo').style.display = 'none';
    checkedIsakuUser = null;
    selectedIsakuCode = null;
    selectedIsakuPrice = 0;
    selectedIsakuData = null;
    selectedMethodIsaku = 'saldo';
    resetPromo('ewallet-isaku');
    checkOrderIsaku();
}

function selectPayMethodIsaku(method) {
    selectedMethodIsaku = method;
    const nameElIsaku = document.getElementById('metodeNameIsaku');
    if (nameElIsaku) nameElIsaku.innerText = getMetodeLabel(method);
    const rincianNameElIsaku = document.getElementById('rincianMetodeNameIsaku');
    if (rincianNameElIsaku) rincianNameElIsaku.innerText = getMetodeLabel(method);
    checkOrderIsaku();
}

function checkOrderIsaku() {
    const btn = document.getElementById('btnBuyIsaku');
    const footerPrice = document.getElementById('footerPriceIsaku');
    const alert = document.getElementById('footerAlertIsaku');

    footerPrice.innerText = 'Rp ' + (selectedIsakuPrice || 0).toLocaleString();

    if (checkedIsakuUser && selectedIsakuCode && selectedMethodIsaku) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';

        let msg = "Lengkapi data.";
        if (!checkedIsakuUser) msg = "Masukkan nomor iSaku yang valid (08xxxxxxxxxx).";
        else if (!selectedIsakuCode) msg = "Pilih nominal topup.";
        else if (!selectedMethodIsaku) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    }
}

// ============ KASPRO E-WALLET ============
async function fetchKasproProducts() {
    const grid = document.getElementById('kasproProductGrid');
    const loading = document.getElementById('kasproProductLoading');
    if (!grid || !loading) return;

    loading.style.display = 'block';
    grid.innerHTML = '';

    try {
        const res = await fetch('/api/ewallet/products/kaspro');
        const json = await res.json();

        loading.style.display = 'none';

        if (json.success && json.data.length > 0) {
            kasproProducts = json.data;
            renderKasproProducts();
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk / Kosong.</div>';
        }
    } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi.</div>';
    }
}

function renderKasproProducts() {
    const grid = document.getElementById('kasproProductGrid');
    grid.innerHTML = '';

    kasproProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectProductKaspro(card, p);

        card.innerHTML = `
            <div style="display:flex; flex-direction:column; height:100%; justify-content:center; align-items:center;">
                <i class="fas fa-money-bill-wave" style="font-size:24px; line-height:30px; height:30px; margin-bottom:5px; color:var(--primary-color);"></i>
                <span class="prod-name" style="font-size:11px; text-align:center;">${p.name}</span>
                <span class="prod-price">Rp ${p.price.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectProductKaspro(el, data) {
    document.querySelectorAll('#kasproProductGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedKasproCode = data.code;
    selectedKasproPrice = data.price;
    selectedKasproData = data;
    checkOrderKaspro();
    resetPromo('ewallet-kaspro');
    
    // AUTO SCROLL ke step pembayaran
    autoScrollToNextStepByPage('ewallet-kaspro', 1);
}

async function checkKasproNumber() {
    await checkEwalletNumberGlobal('KASPRO');
}

function checkKasproInput() {
    const phone = document.getElementById('kasproPhone').value;
    if (phone.length >= 10) {
        if (!checkedKasproUser) {
            checkedKasproUser = { name: "Memuat...", number: phone };
        }
    } else {
        document.getElementById('kasproUserInfo').style.display = 'none';
        checkedKasproUser = null;
    }
    checkOrderKaspro();
}

function resetKasproInputs() {
    document.getElementById('kasproPhone').value = '';
    document.getElementById('kasproUserInfo').style.display = 'none';
    checkedKasproUser = null;
    selectedKasproCode = null;
    selectedKasproPrice = 0;
    selectedKasproData = null;
    selectedMethodKaspro = 'saldo';
    resetPromo('ewallet-kaspro');
    checkOrderKaspro();
}

function selectPayMethodKaspro(method) {
    selectedMethodKaspro = method;
    const nameElKaspro = document.getElementById('metodeNameKaspro');
    if (nameElKaspro) nameElKaspro.innerText = getMetodeLabel(method);
    const rincianNameElKaspro = document.getElementById('rincianMetodeNameKaspro');
    if (rincianNameElKaspro) rincianNameElKaspro.innerText = getMetodeLabel(method);
    checkOrderKaspro();
}

function checkOrderKaspro() {
    const btn = document.getElementById('btnBuyKaspro');
    const footerPrice = document.getElementById('footerPriceKaspro');
    const alert = document.getElementById('footerAlertKaspro');

    footerPrice.innerText = 'Rp ' + (selectedKasproPrice || 0).toLocaleString();

    if (checkedKasproUser && selectedKasproCode && selectedMethodKaspro) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';

        let msg = "Lengkapi data.";
        if (!checkedKasproUser) msg = "Masukkan nomor Kaspro yang valid (08xxxxxxxxxx).";
        else if (!selectedKasproCode) msg = "Pilih nominal topup.";
        else if (!selectedMethodKaspro) msg = "Pilih pembayaran.";

        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    }
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            if (target === 'info') {
                isInfoMenuOpened = true;
                const badge = document.getElementById('infoBadge');
                if (badge) badge.classList.remove('show');

                const bellIcon = document.querySelector('.nav-item[data-target="info"] i');
                if (bellIcon) bellIcon.classList.remove('shake-bell');
                switchPage('info'); 
                loadInfoPage(); 
                
            } else if (target === 'home') {
                switchPage('home');
            } else {
                if (!checkLogin().token) window.location.href = '/login';
                else switchPage(target);
            }
        });
    });
    document.getElementById('btnOpenSidebar')?.addEventListener('click', openSidebar);
    overlay?.addEventListener('click', closeSidebar);

    document.getElementById('btnKeuntungan')?.addEventListener('click', () => {
        keuntunganModal.classList.add('show');
    });

    document.getElementById('btnCloseKeuntungan')?.addEventListener('click', () => {
        keuntunganModal.classList.remove('show');
    });

    document.getElementById('btnTutupKeuntungan')?.addEventListener('click', () => {
        keuntunganModal.classList.remove('show');
    });

    document.getElementById('btnRefreshSMM')?.addEventListener('click', async () => {
        const btn = document.getElementById('btnRefreshSMM');
        const icon = btn.querySelector('i');
        icon.classList.add('fa-spin');
        await loadRiwayatSMM();
        setTimeout(() => icon.classList.remove('fa-spin'), 500);
    });

    document.getElementById('btnGoSubdomain')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('subdomain');
            fetchCFZones();
        }
    });

    document.getElementById('btnBackSubdomain')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('subdomainName')?.addEventListener('input', checkOrderSub);
    document.getElementById('subdomainIP')?.addEventListener('input', checkOrderSub);

    document.getElementById('btnCaraBeliSubdomain')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Beli Subdomain',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>Nama Subdomain</b> (huruf kecil, tanpa spasi).</li>
                    <li>Masukkan <b>IP Address</b> VPS Anda.</li>
                    <li>Atur <b>Proxy</b> (Off = Direct IP, On = Lewat CF).</li>
                    <li>Pilih <b>Domain Utama</b> yang tersedia.</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#2980b9; background:#eaf2f8; padding:10px; border-radius:6px; text-align:left;">
                    <b><i class="fas fa-gift"></i> Bonus:</b><br>
                    Setiap pembelian otomatis mendapatkan record tambahan random, misal: <b>node123.nama.domain.com</b>
                </div>
            `,
            confirmButtonText: 'Oke Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuySub')?.addEventListener('click', () => {
        if (!selectedZone || !selectedMethodSub) return;

        const sub = document.getElementById('subdomainName').value;
        const ip = document.getElementById('subdomainIP').value;
        const isProxy = document.getElementById('subdomainProxy').checked;

        document.getElementById('cs-name').innerText = sub;
        document.getElementById('cs-domain').innerText = selectedZone.name;
        document.getElementById('cs-ip').innerText = ip;
        document.getElementById('cs-proxy').innerText = isProxy ? 'ON (Orange)' : 'OFF (Grey)';
        document.getElementById('cs-method-sub').innerText = selectedMethodSub.toUpperCase();
        const finalSubPrice = getFinalPriceByPage('subdomain');
        document.getElementById('cs-total-sub').innerText = 'Rp ' + finalSubPrice.toLocaleString();

        fillBuyerInfoForModal('confirmSubModal');
        document.getElementById('confirmSubModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmSub')?.addEventListener('click', () => document.getElementById('confirmSubModal').classList.remove('show'));

    document.getElementById('btnFinalPaySub')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPaySub');
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const sub = document.getElementById('subdomainName').value;
    const ip = document.getElementById('subdomainIP').value;
    const isProxy = document.getElementById('subdomainProxy').checked;
    const finalSubPrice = getFinalPriceByPage('subdomain');
    const promoDataSub = getPromoDataByPage('subdomain');

    try {
        const res = await fetch('/api/buy-subdomain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                subdomain: sub,
                ip_address: ip,
                zone_id: selectedZone.id,
                zone_name: selectedZone.name,
                proxy_status: isProxy,
                price: selectedZone.price,
                method: selectedMethodSub,
                promo_code: promoDataSub ? promoDataSub.code : null,
                final_amount: finalSubPrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmSubModal').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = "BAYAR SEKARANG";
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                const fullDomain = `${sub}.${selectedZone ? selectedZone.name : ''}`;
                showPurchaseSuccessPage({
                    judul: 'SUBDOMAIN BERHASIL DIBUAT',
                    subjudul: 'Subdomain kamu sudah aktif. Klik Cek Pesanan untuk lihat detail.',
                    iconHtml: '<i class="fas fa-globe" style="color:var(--primary-color);"></i>',
                    labelProduk: 'Subdomain',
                    valueProduk: fullDomain || '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalSubPrice,
                    total: data.amount || finalSubPrice,
                    cekWarna: '#2980b9',
                    cekIcon: '<i class="fas fa-globe"></i>',
                    cekTeks: 'LIHAT DATA SUBDOMAIN',
                    lastOrderId: data.order_id || null,
                    cekPesananFn: () => {
                        if (document.getElementById('menuSubdomainSaya')) document.getElementById('menuSubdomainSaya').click();
                    }
                });
            } else {
                Swal.fire('Gagal', data.message, 'error');
            }
        }
    } catch (e) {
        console.log(e);
        let pesan = 'Terjadi kesalahan sistem';
        if (e.response && e.response.data && e.response.data.message) {
            pesan = e.response.data.message;
        } else if (e.message) {
            pesan = e.message;
        }
        Swal.fire('Gagal', pesan, 'error');
    } finally {
        btn.innerText = "BAYAR SEKARANG";
        btn.disabled = false;
    }
});

    document.getElementById('btnGoSosmed')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('sosmed');
            if (sosmedServices.length === 0) fetchSosmedServices();
        }
    });

    document.getElementById('btnBackSosmed')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('sosmedCategory')?.addEventListener('change', (e) => {
        renderSosmedServices(e.target.value);
        document.getElementById('sosmedDesc').style.display = 'none';
        document.getElementById('sosmedLimit').style.display = 'none';
        selectedSosmedService = null;
        calculateSosmedPrice();
    });

    document.getElementById('sosmedService')?.addEventListener('change', (e) => {
    const id = parseInt(e.target.value);
    selectedSosmedService = sosmedServices.find(s => s.id === id);

    if (selectedSosmedService) {
        const descEl = document.getElementById('sosmedDesc');
        const limitEl = document.getElementById('sosmedLimit');

        descEl.innerHTML = selectedSosmedService.desc;
        descEl.style.display = 'block';

        limitEl.innerText = `Minimal: ${selectedSosmedService.min} | Maksimal: ${selectedSosmedService.max} | Min. order: Rp ${sosmedPricing.min_order.toLocaleString('id-ID')}`;
        limitEl.style.display = 'block';
    }
    calculateSosmedPrice();
    resetPromo('sosmed');
    
    // AUTO SCROLL ke step input target & jumlah
    setTimeout(() => {
        const targetInput = document.getElementById('sosmedTarget');
        if (targetInput) {
            targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetInput.focus();
        }
    }, 200);
});

    document.getElementById('sosmedQty')?.addEventListener('input', calculateSosmedPrice);

    document.getElementById('btnBuySosmed')?.addEventListener('click', () => {
        if (!selectedSosmedService || !selectedMethodSosmed) return;

        const target = document.getElementById('sosmedTarget').value;
        const qty = document.getElementById('sosmedQty').value;
        const total = document.getElementById('footerPriceSosmed').innerText;

        if (!target) return Swal.fire('Error', 'Target wajib diisi!', 'error');

        document.getElementById('csm-service').innerText = selectedSosmedService.name;
        document.getElementById('csm-target').innerText = target;
        document.getElementById('csm-qty').innerText = qty;
        document.getElementById('csm-method').innerText = selectedMethodSosmed.toUpperCase();
        const finalSosPrice = getFinalPriceByPage('sosmed');
        document.getElementById('csm-total').innerText = 'Rp ' + finalSosPrice.toLocaleString();

        fillBuyerInfoForModal('confirmSosmedModal');
        document.getElementById('confirmSosmedModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmSosmed')?.addEventListener('click', () => {
        document.getElementById('confirmSosmedModal').classList.remove('show');
    });

    document.getElementById('btnFinalPaySosmed')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPaySosmed');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const target = document.getElementById('sosmedTarget').value;
    const qty = parseInt(document.getElementById('sosmedQty').value);
    const finalSosmedPrice = getFinalPriceByPage('sosmed');
    const promoDataSosmed = getPromoDataByPage('sosmed');

    try {
        const res = await fetch('/api/buy-sosmed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                service_id: selectedSosmedService.id,
                target: target,
                quantity: qty,
                method: selectedMethodSosmed,
                promo_code: promoDataSosmed ? promoDataSosmed.code : null,
                final_amount: finalSosmedPrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmSosmedModal').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'SUNTUIK BERHASIL',
                    subjudul: 'Pesanan sosmed sedang diproses oleh sistem.',
                    iconHtml: '<i class="fas fa-rocket" style="color:var(--primary-color);"></i>',
                    labelProduk: 'Layanan',
                    valueProduk: selectedSosmedService ? selectedSosmedService.name : '-',
                    labelNominal: 'Jumlah',
                    nominal: data.amount || finalSosmedPrice,
                    total: data.amount || finalSosmedPrice,
                    cekWarna: '#e91e63',
                    cekIcon: '<i class="fas fa-rocket"></i>',
                    cekTeks: 'CEK STATUS ORDER',
                    lastOrderId: data.order_id || null,
                    cekPesananFn: () => switchPage('transaksi')
                });
            } 
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        console.log(e);
        let pesan = 'Terjadi kesalahan sistem';
        if (e.response && e.response.data && e.response.data.message) {
            pesan = e.response.data.message;
        } else if (e.message) {
            pesan = e.message;
        }
        Swal.fire('Gagal', pesan, 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    document.getElementById('btnGoVPS')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('vps');
            fetchVPS();
        }
    });

    document.getElementById('btnBackVPS')?.addEventListener('click', () => switchPage('home'));

    // ===================================================
    // APLIKASI PREMIUM (PREMKU)
    // ===================================================
    document.getElementById('btnGoPremiumApp')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('premium-app');
            loadPremiumApps();
        }
    });
    document.getElementById('btnBackPremiumApp')?.addEventListener('click', () => switchPage('home'));

    async function loadPremiumApps() {
        const grid = document.getElementById('premiumAppGrid');
        if (!grid) return;
        grid.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);"><i class="fas fa-spinner fa-spin"></i> Memuat daftar aplikasi...</div>';
        try {
            const res = await fetch('/api/premium-apps', { method: 'POST' });
            const data = await res.json();
            if (!data.success || !data.data.length) {
                grid.innerHTML = stockEmptyHtml('Aplikasi Premium');
                return;
            }
            premiumAppList = data.data;
            grid.innerHTML = premiumAppList.map(p => {
                const habis = p.status !== 'available' || p.stock <= 0;
                const descPreview = p.description ? escapeHtml(p.description.length > 60 ? p.description.substring(0, 60) + '..' : p.description) : '';
                return `
                <div class="metode-row-card" style="opacity:${habis ? '0.55' : '1'};" onclick="${habis ? '' : `selectPremiumApp('${p.id}')`}">
                    <div class="metode-left">
                        <div class="metode-icon">${p.image ? `<img src="/api/premku-image-proxy?url=${encodeURIComponent(p.image)}" onerror="this.onerror=null;this.parentElement.innerHTML='<i class=\\'fas fa-mobile-alt\\'></i>';" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : '<i class="fas fa-mobile-alt"></i>'}</div>
                        <div>
                            <div class="metode-name">${p.name}${p.is_am ? ' <span style=\"color:#f97316;font-size:10px;font-weight:900;\">INSTAN</span>' : ''}</div>
                            <div class="metode-sub">Rp ${parseInt(p.price).toLocaleString('id-ID')} • ${habis ? 'Stok Kosong' : 'Stok ' + p.stock}</div>
                            ${descPreview ? `<div style="font-size:11px;color:var(--text-sub);opacity:0.8;margin-top:2px;"><i class="fas fa-circle-info" style="font-size:9px;"></i> ${descPreview}</div>` : ''}
                        </div>
                    </div>
                    ${habis ? '<span style="font-size:11px;color:#e74c3c;font-weight:bold;">STOK KOSONG</span>' : '<i class="fas fa-chevron-right"></i>'}
                </div>`;
            }).join('');
        } catch (e) {
            grid.innerHTML = '<div style="text-align:center; padding:20px; color:#e74c3c;">Gagal memuat daftar aplikasi.</div>';
        }
    }
    window.loadPremiumApps = loadPremiumApps;

    function updatePremiumAppTotal() {
        if (!selectedPremiumApp) return;
        const total = selectedPremiumApp.price * premiumAppQty;
        const totalEl = document.getElementById('cpa-total');
        const priceEl = document.getElementById('cpa-price');
        if (totalEl) totalEl.innerText = 'Rp ' + total.toLocaleString('id-ID');
        if (priceEl) priceEl.innerText = 'Rp ' + selectedPremiumApp.price.toLocaleString('id-ID');
        const qtyEl = document.getElementById('cpaQty');
        if (qtyEl) qtyEl.innerText = premiumAppQty;
    }

    window.selectPremiumApp = function (id) {
        const product = premiumAppList.find(p => String(p.id) === String(id));
        if (!product) return;
        selectedPremiumApp = product;
        premiumAppQty = 1;
        document.getElementById('cpa-prod').innerText = product.name;
        document.getElementById('cpaWarningStok').style.display = product.is_am ? 'none' : 'block';

        const descBox = document.getElementById('cpaDescBox');
        const descText = document.getElementById('cpaDescText');
        if (product.description && product.description.trim()) {
            descText.innerText = product.description;
        } else {
            descText.innerHTML = '<span style="opacity:0.6;">Provider tidak menyertakan deskripsi untuk produk ini.</span>';
        }
        descBox.style.display = 'block';

        updatePremiumAppTotal();
        document.getElementById('confirmPremiumAppModal')?.classList.add('show');
    };

    document.getElementById('btnCloseConfirmPremiumApp')?.addEventListener('click', () => {
        document.getElementById('confirmPremiumAppModal')?.classList.remove('show');
    });
    document.getElementById('cpaQtyMin')?.addEventListener('click', () => {
        if (premiumAppQty > 1) { premiumAppQty--; updatePremiumAppTotal(); }
    });
    document.getElementById('cpaQtyPlus')?.addEventListener('click', () => {
        if (selectedPremiumApp && premiumAppQty < (selectedPremiumApp.is_am ? 200 : (selectedPremiumApp.stock || 1))) {
            premiumAppQty++; updatePremiumAppTotal();
        }
    });

    document.getElementById('btnFinalPayPremiumApp')?.addEventListener('click', async function () {
        if (!selectedPremiumApp) return;
        const btn = this;
        const originalText = btn.innerText;
        btn.innerText = 'Memproses...';
        btn.disabled = true;
        try {
            const token = checkLogin().token;
            const res = await fetch('/api/buy-premium-app', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, product_id: selectedPremiumApp.id, qty: premiumAppQty, method: 'saldo' })
            });
            const data = await res.json();

            if (data.success) {
                document.getElementById('confirmPremiumAppModal')?.classList.remove('show');

                if (data.type === 'instant') {
                    const accs = (data.data && data.data.accounts) || [];
                    const accHtml = accs.map(a => `<i class="fas fa-envelope"></i> ${a.username}<br><i class="fas fa-key"></i> ${a.password}`).join('<br><br>');
                    showPurchaseSuccessPage({
                        judul: 'ORDER BERHASIL',
                        subjudul: 'Akun Aplikasi Premium berhasil digenerate!',
                        labelProduk: 'Aplikasi',
                        valueProduk: selectedPremiumApp.name + (accHtml ? '<br><br>' + accHtml : ''),
                        labelNominal: 'Harga',
                        nominal: selectedPremiumApp.price * premiumAppQty,
                        total: selectedPremiumApp.price * premiumAppQty,
                        cekWarna: '#f97316',
                        cekIcon: '<i class="fas fa-box-open"></i>',
                        cekTeks: 'LIHAT DETAIL ORDER',
                        lastOrderId: data.data.order_id,
                        cekPesananFn: () => switchPage('transaksi')
                    });
                } else {
                    showPurchaseSuccessPage({
                        judul: 'ORDER SEDANG DIPROSES',
                        subjudul: 'Status order mengikuti server provider, cek berkala di riwayat transaksi ya.',
                        labelProduk: 'Aplikasi',
                        valueProduk: selectedPremiumApp.name,
                        labelNominal: 'Harga',
                        nominal: selectedPremiumApp.price * premiumAppQty,
                        total: selectedPremiumApp.price * premiumAppQty,
                        iconHtml: '<i class="fas fa-hourglass-half" style="color:var(--primary-color);"></i>',
                        cekWarna: '#f97316',
                        cekIcon: '<i class="fas fa-rocket"></i>',
                        cekTeks: 'CEK STATUS ORDER',
                        lastOrderId: data.data.order_id,
                        cekPesananFn: () => switchPage('transaksi')
                    });
                }
            } else {
                Swal.fire('Gagal', data.message || 'Terjadi kesalahan', 'error');
            }
        } catch (e) {
            Swal.fire('Gagal', 'Terjadi kesalahan sistem', 'error');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById('btnCaraBeliVPS')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Beli VPS',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Pilih <b>Paket VPS</b> sesuai spesifikasi (RAM/CPU).</li>
                    <li>Pilih <b>Metode Pembayaran</b> (Saldo/QRIS).</li>
                    <li>Klik tombol <b>Beli Sekarang</b>.</li>
                    <li>Setelah pembayaran sukses, silakan <b>Chat Admin</b> untuk pengambilan IP & Password root.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#c0392b; background:#f9e79f; padding:8px; border-radius:6px; text-align:left; border-left:4px solid #f1c40f;">
                    <b><i class="fas fa-triangle-exclamation"></i> Info:</b><br>
                    Proses setup VPS membutuhkan waktu estimasi 15-30 menit setelah konfirmasi ke Admin.
                </div>
            `,
            confirmButtonText: 'Siap, Mengerti',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyVPS')?.addEventListener('click', () => {
        if (!selectedVPSData || !selectedMethodVPS) {
            checkOrderVPS();
            return;
        }
        document.getElementById('cv-prod').innerText = selectedVPSData.name;
        document.getElementById('cv-method').innerText = selectedMethodVPS.toUpperCase();
        const finalVpsPrice = getFinalPriceByPage('vps');
        document.getElementById('cv-total').innerText = 'Rp ' + finalVpsPrice.toLocaleString();
        fillBuyerInfoForModal('confirmVPSModal');
        document.getElementById('confirmVPSModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmVPS')?.addEventListener('click', () => {
        document.getElementById('confirmVPSModal').classList.remove('show');
    });

    document.getElementById('btnFinalPayVPS')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayVPS');
    btn.innerText = "Memproses...";
    btn.disabled = true;
    const finalVpsPrice = getFinalPriceByPage('vps');
    const promoDataVps = getPromoDataByPage('vps');

    try {
        const res = await fetch('/api/buy-vps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                vps_code: selectedVPSCode,
                method: selectedMethodVPS,
                promo_code: promoDataVps ? promoDataVps.code : null,
                final_amount: finalVpsPrice
            })
        });
        const data = await res.json();

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = "BAYAR SEKARANG";
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                const vpsMsg = `Halo Admin, saya sudah order ${selectedVPSData ? selectedVPSData.name : 'VPS'}. Mohon diproses.`;
                showPurchaseSuccessPage({
                    judul: 'ORDER VPS BERHASIL',
                    subjudul: 'Hubungi Admin untuk klaim IP & Password root VPS Anda.',
                    iconHtml: '<i class="fas fa-server" style="color:var(--primary-color);"></i>',
                    labelProduk: 'Paket VPS',
                    valueProduk: selectedVPSData ? selectedVPSData.name : '-',
                    labelNominal: 'Harga Layanan',
                    nominal: data.amount || finalVpsPrice,
                    total: data.amount || finalVpsPrice,
                    cekWarna: '#25D366',
                    cekIcon: '<i class="fab fa-whatsapp"></i>',
                    cekTeks: 'HUBUNGI ADMIN',
                    lastOrderId: data.order_id || null,
                    skipRedirect: true,
                    cekPesananFn: () => window.open(`https://wa.me/6285819066475?text=${encodeURIComponent(vpsMsg)}`, '_blank')
                });
            }
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Gagal koneksi', 'error');
    } finally {
        btn.innerText = "BAYAR SEKARANG";
        btn.disabled = false;
    }
});

    document.getElementById('btnGoScript')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('script');
            fetchScripts();
        }
    });

    document.getElementById('btnBackScript')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCheckScriptFeatures')?.addEventListener('click', () => {
        if (!selectedScriptData) {
            Swal.fire({
                icon: 'warning',
                title: 'Pilih Script Dulu',
                text: 'Silakan pilih paket script di bawah (Step 2) terlebih dahulu.',
                confirmButtonColor: '#e67e22'
            });
        } else {
            const rawMenu = selectedScriptData.features ? selectedScriptData.features.join('\n') : 'Belum ada detail fitur.';
            Swal.fire({
                title: `Fitur: ${selectedScriptData.name}`,
                html: `
                    <div style="
                        text-align: left; 
                        white-space: pre-wrap; 
                        font-family: 'Courier New', monospace; 
                        font-size: 12px; 
                        background: #f5f6fa; 
                        padding: 10px; 
                        border-radius: 8px; 
                        max-height: 400px; 
                        overflow-y: auto;
                        border: 1px solid #ddd;
                        color: #333;">${rawMenu}</div>
                `,
                width: 600,
                confirmButtonText: 'Mantap',
                confirmButtonColor: 'var(--primary-color)'
            });
        }
    });

    document.getElementById('btnKeuntunganScript')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Keuntungan Script',
            html: `
                <ul style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6;">
                    <li><i class="fas fa-fire"></i> <b>Full Source Code</b> (Bisa diedit).</li>
                    <li><i class="fas fa-bolt"></i> <b>Sekali Bayar</b> (Tanpa biaya bulanan).</li>
                    <li><i class="fas fa-shield-halved"></i> <b>Anti Encrypt</b> (Kode transparan).</li>
                    <li><i class="fas fa-rocket"></i> <b>Update Gratis</b> (Jika ada versi baru).</li>
                </ul>
            `,
            confirmButtonText: 'Tutup',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnCaraBeliScript')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Beli Script',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6;">
                    <li>Pilih <b>Paket Script</b> di daftar.</li>
                    <li>Klik tombol <b>Cek Fitur</b> jika ingin melihat detail.</li>
                    <li>Pilih <b>Metode Pembayaran</b>.</li>
                    <li>Klik <b>Beli Sekarang</b>.</li>
                    <li>Setelah sukses, buka menu sidebar <b>Download Script</b>.</li>
                </ol>
            `,
            confirmButtonText: 'Paham'
        });
    });

    document.getElementById('btnBuyScript')?.addEventListener('click', () => {
        if (!selectedScriptData || !selectedMethodScript) {
            checkOrderScript();
            return;
        }
        document.getElementById('cscr-prod').innerText = selectedScriptData.name;
        document.getElementById('cscr-method').innerText = selectedMethodScript.toUpperCase();
        const finalScPrice = getFinalPriceByPage('script');
        document.getElementById('cscr-total').innerText = 'Rp ' + finalScPrice.toLocaleString();

        fillBuyerInfoForModal('confirmScriptModalOverlay');
        document.getElementById('confirmScriptModalOverlay').classList.add('show');
    });

    document.getElementById('btnCloseConfirmScript')?.addEventListener('click', () => {
        document.getElementById('confirmScriptModalOverlay').classList.remove('show');
    });

    document.getElementById('btnFinalPayScript')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayScript');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;
    const finalScPrice = getFinalPriceByPage('script');
    const promoDataSc = getPromoDataByPage('script');

    try {
        const res = await fetch('/api/buy-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                script_code: selectedScriptCode,
                method: selectedMethodScript,
                promo_code: promoDataSc ? promoDataSc.code : null,
                final_amount: finalScPrice
            })
        });
        const data = await res.json();

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'SCRIPT BERHASIL DIBELI',
                    subjudul: 'Script siap didownload di menu Download Script.',
                    iconHtml: '<i class="fas fa-laptop-code" style="color:var(--primary-color);"></i>',
                    labelProduk: 'Nama Script',
                    valueProduk: selectedScriptData ? selectedScriptData.name : '-',
                    labelNominal: 'Harga Script',
                    nominal: data.amount || finalScPrice,
                    total: data.amount || finalScPrice,
                    cekWarna: '#3498db',
                    cekIcon: '<i class="fas fa-download"></i>',
                    cekTeks: 'DOWNLOAD SCRIPT',
                    cekPesananFn: () => { if (document.getElementById('menuDownloadScript')) document.getElementById('menuDownloadScript').click(); }
                });
            }
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Gagal terhubung ke server', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    document.getElementById('btnGoMurid')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('murid');
            fetchMurid();
        }
    });

    document.getElementById('btnBackMurid')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCheckMuridBenefits')?.addEventListener('click', () => {
        if (!selectedMuridData) {
            Swal.fire({
                icon: 'warning',
                title: 'Pilih Paket Dulu',
                text: 'Silakan pilih paket kelas di bawah (Step 2) terlebih dahulu.',
                confirmButtonColor: '#e67e22'
            });
        } else {
            const benefitList = selectedMuridData.benefits ? selectedMuridData.benefits.map(f => `<li><i class="fas fa-check-circle" style="color:#2ecc71;"></i> ${f}</li>`).join('') : '<li>Full Akses</li>';
            Swal.fire({
                title: `Keuntungan: ${selectedMuridData.name}`,
                html: `<ul style="text-align:left; padding-left:20px; color:#555; line-height:1.8;">${benefitList}</ul>`,
                confirmButtonText: 'Mantap, Saya Ambil',
                confirmButtonColor: 'var(--primary-color)'
            });
        }
    });

    document.getElementById('btnCaraJoinMurid')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Join Murid',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6;">
                    <li>Pilih <b>Paket Kelas</b> yang sesuai.</li>
                    <li>Cek <b>Keuntungan</b> untuk detail fasilitas.</li>
                    <li>Pilih Metode Pembayaran & Bayar.</li>
                    <li>Setelah sukses, Admin akan chat WA Anda untuk invite grup.</li>
                </ol>
            `,
            confirmButtonText: 'Siap'
        });
    });

    document.getElementById('btnCaraBeliSosmed')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Order Sosmed',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Pilih <b>Kategori</b> (Instagram, TikTok, dll).</li>
                    <li>Pilih <b>Layanan</b> yang diinginkan.</li>
                    <li>Baca <b>Deskripsi</b> layanan (Min/Max order).</li>
                    <li>Masukkan <b>Target</b> (Username atau Link Post).</li>
                    <li>Masukkan <b>Jumlah</b> yang mau dibeli.</li>
                    <li>Klik <b>Suntuik Sekarang</b>.</li>
                </ol>
                <div style="margin-top:15px; font-size:12px; color:#c0392b; background:#f9e79f; padding:10px; border-radius:6px; text-align:left; border-left:4px solid #f1c40f;">
                    <b><i class="fas fa-triangle-exclamation"></i> PENTING:</b><br>
                    1. Akun target <b>JANGAN DI-PRIVATE</b> (Wajib Publik).<br>
                    2. Jangan ganti username selama proses.<br>
                    3. Jangan order layanan sama untuk target sama jika status belum selesai.
                </div>
            `,
            confirmButtonText: 'Siap, Saya Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyMurid')?.addEventListener('click', () => {
        if (!selectedMuridData || !selectedMethodMurid) {
            checkOrderMurid();
            return;
        }
        document.getElementById('cm-prod').innerText = selectedMuridData.name;
        document.getElementById('cm-method').innerText = selectedMethodMurid.toUpperCase();
        const finalMrdPrice = getFinalPriceByPage('murid');
        document.getElementById('cm-total').innerText = 'Rp ' + finalMrdPrice.toLocaleString();
        fillBuyerInfoForModal('confirmMuridModalOverlay');
        document.getElementById('confirmMuridModalOverlay').classList.add('show');
    });

    document.getElementById('btnCloseConfirmMurid')?.addEventListener('click', () => {
        document.getElementById('confirmMuridModalOverlay').classList.remove('show');
    });

    document.getElementById('btnFinalPayMurid')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayMurid');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;
    const finalMrdPrice = getFinalPriceByPage('murid');
    const promoDataMrd = getPromoDataByPage('murid');

    try {
        const res = await fetch('/api/buy-murid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                murid_code: selectedMuridCode,
                method: selectedMethodMurid,
                promo_code: promoDataMrd ? promoDataMrd.code : null,
                final_amount: finalMrdPrice
            })
        });
        const data = await res.json();

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'JOIN KELAS BERHASIL',
                    subjudul: 'Akses kelas di menu Kelas Saya.',
                    iconHtml: '<i class="fas fa-graduation-cap" style="color:var(--primary-color);"></i>',
                    labelProduk: 'Paket Kelas',
                    valueProduk: selectedMuridData ? selectedMuridData.name : '-',
                    labelNominal: 'Biaya Join',
                    nominal: data.amount || finalMrdPrice,
                    total: data.amount || finalMrdPrice,
                    cekWarna: '#9b59b6',
                    cekIcon: '<i class="fas fa-graduation-cap"></i>',
                    cekTeks: 'BUKA KELAS SAYA',
                    cekPesananFn: () => { if (document.getElementById('menuKelasSaya')) document.getElementById('menuKelasSaya').click(); }
                });
            }
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Gagal terhubung ke server', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    const modalScriptOverlay = document.getElementById('confirmScriptModalOverlay');
    if (modalScriptOverlay) {
        modalScriptOverlay.addEventListener('click', (e) => {
            if (e.target === modalScriptOverlay) modalScriptOverlay.classList.remove('show');
        });
    }

    const openHelpList = [document.getElementById('btnHelpTrxTop')];
    openHelpList.forEach(btn => { if (btn) btn.addEventListener('click', () => helpModal.classList.add('show')); });
    document.getElementById('btnCloseHelp')?.addEventListener('click', () => helpModal.classList.remove('show'));

    if (document.getElementById('btnSearchTrx')) {
        document.getElementById('btnSearchTrx').addEventListener('click', () => dateFilterModal.classList.add('show'));
        document.getElementById('btnCloseDateFilter').addEventListener('click', () => dateFilterModal.classList.remove('show'));
        document.getElementById('btnApplyFilter').addEventListener('click', () => {
            const dateVal = document.getElementById('inputDateFilter').value;
            if (!dateVal) return Swal.fire('Pilih Tanggal', 'Silakan tentukan tanggal dulu', 'warning');
            const filtered = allTransactions.filter(t => new Date(t.date).toISOString().split('T')[0] === dateVal);
            renderTransactionList(filtered);
            dateFilterModal.classList.remove('show');
            if (filtered.length === 0) Swal.fire({ icon: 'info', title: 'Tidak Ditemukan', toast: true, position: 'top', timer: 2000 });
        });
        document.getElementById('btnResetFilter').addEventListener('click', () => {
            document.getElementById('inputDateFilter').value = '';
            renderTransactionList(allTransactions);
            dateFilterModal.classList.remove('show');
        });
    }

    document.getElementById('btnCloseInvoice')?.addEventListener('click', () => invoiceModal.classList.remove('show'));

    const markAllReadBtn = document.getElementById('btnMarkAllRead');
if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', function() {
        try {
            localStorage.setItem('last_read_all_time', Date.now());
            const infoBadge = document.getElementById('infoBadge');
            if (infoBadge) infoBadge.classList.remove('show');
            const bellIcon = document.querySelector('.nav-item[data-target="info"] i');
            if (bellIcon) bellIcon.classList.remove('shake-bell');
            loadInfoPage();
            updateInfoTabsRedDots();

            Swal.fire({
                icon: 'success',
                title: 'Sapu Bersih!',
                text: 'Semua informasi telah ditandai sudah dibaca.',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 1500
            });
        } catch (e) {
            console.error("Gagal menandai semua sebagai dibaca:", e);
        }
    });
}

    document.getElementById('btnGoPanel')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else switchPage('panel');
    });

    document.getElementById('btnBackPanel')?.addEventListener('click', goBack);

    document.getElementById('panelUser')?.addEventListener('input', function() {
        this.value = this.value.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
        checkOrder();
    });

    document.getElementById('btnBuy')?.addEventListener('click', () => {
        if (!selectedMethod) {
            Swal.fire({
                icon: 'warning',
                title: 'Pilih Pembayaran',
                text: 'Silakan pilih metode pembayaran terlebih dahulu!',
                timer: 2000,
                showConfirmButton: false
            });
            const paymentSection = document.querySelectorAll('.step-box')[2];
            if (paymentSection) {
                paymentSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                paymentSection.style.border = "2px solid #e74c3c";
                setTimeout(() => paymentSection.style.border = "1px solid var(--border-color)", 1000);
            }
            return;
        }
        openModalConfirm();
    });

    document.getElementById('btnFinalPay')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const orderType = document.getElementById('panelOrderType') ? document.getElementById('panelOrderType').value : 'new';
    const username_panel = orderType === 'new' ? document.getElementById('panelUser').value : document.getElementById('existingPanelUser').value;
    
    const btn = document.getElementById('btnFinalPay');

        btn.innerText = "Memproses...";
        btn.disabled = true;

        const finalPrice = getFinalPriceByPage('panel');
        const promoData = getPromoDataByPage('panel');

        try {
            const res = await fetch('/api/buy-panel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    username_panel,
                    order_type: orderType,
                    product_code: selectedProductCode,
                    egg_id: (document.getElementById('panelEgg') || {}).value || null,
                    method: selectedMethod,
                    promo_code: promoData ? promoData.code : null,
                    final_amount: finalPrice
                })
            });
            const data = await res.json();

            // CEK APAKAH USER PERLU UPDATE NOMOR WA
            if (data.requirePhone) {
                btn.innerText = "BAYAR SEKARANG";
                btn.disabled = false;
                Swal.fire({
                    title: 'Lengkapi Nomor WhatsApp',
                    text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                    icon: 'warning',
                    confirmButtonText: 'Update Sekarang',
                    confirmButtonColor: '#2ecc71'
                }).then(() => {
                    switchPage('akun');
                });
                return;
            }
            // ===============================================

            if (data.success) {
                if (data.type === 'instant') {
                    confirmModal.classList.remove('show');
                    Swal.close();
                    const panelUsername = document.getElementById('panelUser') ? document.getElementById('panelUser').value : '-';
                    const finalPanelPrice = getFinalPriceByPage('panel');
                    showPurchaseSuccessPage({
                        judul: 'PANEL BERHASIL DIBUAT',
                        subjudul: 'Panel kamu sudah aktif. Klik Cek Pesanan untuk lihat data.',
                        iconHtml: '<i class="fas fa-server" style="color:var(--primary-color);"></i>',
                        labelProduk: 'Username Panel',
                        valueProduk: panelUsername || '-',
                        labelNominal: 'Harga Paket',
                        nominal: data.amount || finalPanelPrice,
                        total: data.amount || finalPanelPrice,
                        cekWarna: '#3498db',
                        cekIcon: '<i class="fas fa-server"></i>',
                        cekTeks: 'LIHAT DATA PANEL',
                        lastOrderId: data.order_id || null,
                        cekPesananFn: () => {
                            loadUserData();
                            const btnPanel = document.getElementById('menuPanelPopup');
                            if (btnPanel) btnPanel.click();
                        }
                    });
                } 
            } else {
                Swal.fire('Gagal', data.message, 'error');
            }
        } catch (e) {
            Swal.fire('Error', 'Gagal koneksi server', 'error');
        } finally {
            confirmModal.classList.remove('show');
            btn.innerText = "BAYAR SEKARANG";
            btn.disabled = false;
        }
});

    if (window.location.hash === '#panelPopup') {
        history.replaceState(null, null, ' ');
        setTimeout(() => {
            const btnPanel = document.getElementById('menuPanelPopup');
            if (btnPanel) {
                btnPanel.click();
            }
        }, 500);
    }

    document.getElementById('btnCloseConfirm')?.addEventListener('click', () => confirmModal.classList.remove('show'));

    document.querySelectorAll('.tab-item-clean').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-item-clean').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const filterType = tab.getAttribute('data-filter');
            let filteredData = allTransactions;
            if (filterType === 'success') filteredData = allTransactions.filter(t => t.status === 'success');
            else if (filterType === 'pending') filteredData = allTransactions.filter(t => t.status === 'pending');
            else if (filterType === 'failed') filteredData = allTransactions.filter(t => t.status === 'canceled' || t.status === 'expired');
            renderTransactionList(filteredData);
        });
    });

    document.getElementById('btnCaraBeli')?.addEventListener('click', () => caraBeliModal.classList.add('show'));
    document.getElementById('btnCloseCaraBeli')?.addEventListener('click', () => caraBeliModal.classList.remove('show'));

    // DEPOSIT -> halaman /deposit (khusus isi saldo)
    document.getElementById('btnBukaDompet')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else window.location.href = '/deposit';
    });

    // TRANSFER -> halaman /transfer (khusus kirim saldo)
    document.getElementById('btnBukaTransfer')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else window.location.href = '/transfer';
    });

    document.getElementById('btnCloseDeposit')?.addEventListener('click', () => modalDeposit.classList.remove('show'));
    document.getElementById('btnProsesDeposit')?.addEventListener('click', processDeposit);
    document.getElementById('btnAlertOk')?.addEventListener('click', () => customAlertModal.classList.remove('show'));
    document.getElementById('themeToggle')?.addEventListener('click', () => document.body.classList.toggle('dark-mode'));

    document.getElementById('btnCancelCrop')?.addEventListener('click', () => {
        cropModal.classList.remove('show');
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        document.getElementById('fileProfile').value = '';
        document.getElementById('fileBanner').value = '';
    });

    document.getElementById('btnCloseCrop')?.addEventListener('click', () => document.getElementById('btnCancelCrop').click());

    document.getElementById('btnApplyCrop')?.addEventListener('click', () => {
        if (!cropper) return;
        const type = currentCropType;
        const canvas = cropper.getCroppedCanvas({ width: 600, height: type === 'profile' ? 600 : 337 });
        if (!canvas) { Swal.fire('Gagal', 'Gambar tidak bisa diproses, coba pilih foto lain.', 'error'); return; }
        // Preview pakai data URL (bukan blob:) supaya tidak diblokir CSP
        const previewUrl = canvas.toDataURL('image/jpeg', 0.8);
        canvas.toBlob((blob) => {
            if (!blob) { Swal.fire('Gagal', 'Gambar tidak bisa diproses, coba pilih foto lain.', 'error'); return; }
            if (type === 'profile') {
                pendingProfileBlob = blob;
                document.getElementById('displayProfile').src = previewUrl;
            } else {
                pendingBannerBlob = blob;
                document.getElementById('displayBanner').style.backgroundImage = `url('${previewUrl}')`;
            }
            cropModal.classList.remove('show');
            if (cropper) { cropper.destroy(); cropper = null; }
            document.getElementById('fileProfile').value = '';
            document.getElementById('fileBanner').value = '';
            // Langsung unggah + tampilkan loading & notifikasi sukses
            autoSaveProfileImage(type);
        }, 'image/jpeg', 0.8);
    });

    // Daftar modal yang akan ditutup saat klik di luar
const modalsToClose = [helpModal, caraBeliModal, confirmModal, modalDeposit, customAlertModal, invoiceModal, dateFilterModal, cropModal, panelPopupModal, keuntunganModal];
modalsToClose.forEach(modal => {
    if (modal && modal.addEventListener) {
        modal.addEventListener('click', (e) => { 
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    }
});

    setupAccountListeners();
    setupSidebarMenus();
    setupAccordion();

    const inputDepo = document.getElementById('depoAmount');
    if (inputDepo) {
        inputDepo.addEventListener('input', () => {
            document.querySelectorAll('.preset-btn').forEach(btn => {
                btn.classList.remove('active');
            });
        });
    }

    const promoModal = document.getElementById('promoApkModal');
    const btnClosePromo = document.getElementById('btnClosePromo');
    const btnDownloadApk = document.getElementById('btnDownloadApk');

    function createFireBurst(e) {
        const burstCount = 15;
        for (let i = 0; i < burstCount; i++) {
            const fire = document.createElement('div');
            fire.innerHTML = '<i class="fas fa-fire" style="color:#f39c12;"></i>';
            fire.className = 'fire-emoji';
            const startX = e.clientX || window.innerWidth / 2;
            const startY = e.clientY || window.innerHeight / 2;
            fire.style.left = startX + 'px';
            fire.style.top = startY + 'px';
            const angle = Math.random() * Math.PI * 2;
            const velocity = 60 + Math.random() * 120;
            const tx = Math.cos(angle) * velocity;
            const ty = Math.sin(angle) * velocity - 50;
            fire.style.setProperty('--tx', tx + 'px');
            fire.style.setProperty('--ty', ty + 'px');
            fire.style.transform = `rotate(${Math.random() * 60 - 30}deg)`;

            document.body.appendChild(fire);
            setTimeout(() => {
                fire.remove();
            }, 1200);
        }
    }

    function savePromoApkPref() {
        const chkHide = document.getElementById('chkHidePromoApk');
        const isStandaloneNow = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        // Khusus APK: kalau dicentang, simpan biar gak muncul lagi. Di web, gak disimpan (tetap muncul tiap refresh).
        if (isStandaloneNow && chkHide) {
            const hide = chkHide.checked;
            if (hide) {
                localStorage.setItem('hideApkPromoBanner', 'true');
            } else {
                localStorage.removeItem('hideApkPromoBanner');
            }
            // Simpan juga ke akun, biar gak balik muncul walau cache/data apk dihapus
            const { token } = checkLogin();
            if (token) {
                fetch('/api/update-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, hide_promo_apk: hide })
                }).catch(() => {});
            }
        }
    }

    if (btnClosePromo) {
        btnClosePromo.addEventListener('click', (e) => {
            savePromoApkPref();
            if (promoModal) promoModal.classList.remove('show');
            createFireBurst(e);
        });
    }

    if (btnDownloadApk) {
        btnDownloadApk.addEventListener('click', () => {
            savePromoApkPref();
            if (promoModal) promoModal.classList.remove('show');
        });
    }

    document.getElementById('btnGoEwallet')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('ewallet-dana');
            fetchEwalletProductsDANA();
            resetEwalletInputs();
        }
    });

    document.getElementById('btnBackEwallet')?.addEventListener('click', () => switchPage('home'));
    
    // ============ MENU TUTORIAL ============
    document.getElementById('menuTutorial')?.addEventListener('click', () => {
        closeSidebar(); // Tutup sidebar dulu
        switchPage('tutorial'); // Pindah ke halaman tutorial
    });

    document.getElementById('btnBackTutorial')?.addEventListener('click', () => {
        switchPage('home'); // Tombol back kembali ke home
        tutupVideoTutorial(); // Pastikan video mati saat kembali
    });

    document.getElementById('btnCaraBeliEwallet')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup DANA',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>Nomor DANA</b> Anda.</li>
                    <li>Periksa lagi nomornya, pastikan <b>sudah benar</b> sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Topup</b> yang diinginkan.</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                    <li>Dana akan masuk otomatis ke akun DANA Anda.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#e74c3c; background:#ffebee; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-triangle-exclamation"></i> Catatan:</b> Pastikan nomor yang dimasukkan sudah benar dan terdaftar di DANA. Kesalahan nomor bukan tanggung jawab kami.
                </div>
            `,
            confirmButtonText: 'Oke Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyEwallet')?.addEventListener('click', function() {
        if (!selectedEwalletData || !selectedMethodEwallet) {
            checkOrderEwallet();
            return;
        }
        if (!checkedEwalletUser) {
            Swal.fire('Error', 'Masukkan nomor DANA yang valid!', 'warning');
            return;
        }

        document.getElementById('ce-name').innerText = checkedEwalletUser.name || '-';
        document.getElementById('ce-phone').innerText = checkedEwalletUser.number || '-';
        document.getElementById('ce-prod').innerText = selectedEwalletData.name || '-';
        document.getElementById('ce-method').innerText = getMetodeLabel(selectedMethodEwallet) || '-';
        const finalEwalletPrice = getFinalPriceByPage('ewallet');
        document.getElementById('ce-total').innerText = 'Rp ' + (finalEwalletPrice || 0).toLocaleString();

        fillBuyerInfoForModal('confirmEwalletModal');
        document.getElementById('confirmEwalletModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmEwallet')?.addEventListener('click', () => {
        document.getElementById('confirmEwalletModal').classList.remove('show');
    });

    document.getElementById('btnFinalPayEwallet')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayEwallet');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const finalEwalletPrice = getFinalPriceByPage('ewallet');
    const promoDataEwallet = getPromoDataByPage('ewallet');

    try {
        const res = await fetch('/api/buy-ewallet/dana', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedEwalletCode,
                target: checkedEwalletUser.number,
                method: selectedMethodEwallet,
                promo_code: promoDataEwallet ? promoDataEwallet.code : null,
                final_amount: finalEwalletPrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmEwalletModal').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'TOPUP DANA BERHASIL',
                    subjudul: `Saldo DANA untuk ${checkedEwalletUser ? checkedEwalletUser.name : '-'} sedang diproses.`,
                    iconHtml: '<img src="https://api.deline.web.id/RzSYWF9Wxz.jpeg" style="width:60px;height:60px;border-radius:50%;border:3px solid #1e3c72;">',
                    labelProduk: 'Nominal',
                    valueProduk: selectedEwalletData ? selectedEwalletData.name : '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalEwalletPrice,
                    total: data.amount || finalEwalletPrice,
                    cekWarna: '#1e3c72',
                    cekIcon: '<i class="fas fa-wallet"></i>',
                    cekTeks: 'CEK STATUS TOPUP',
                    cekPesananFn: () => switchPage('transaksi')
                });
                resetEwalletInputs();
            } 
        } else {
            Swal.fire('Gagal', data.message, 'error');
            if (data.refund) {
                loadUserData();
            }
        }
    } catch (e) {
        console.log(e);
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    document.getElementById('btnGoEwalletGD')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('ewallet-gd');
            fetchEwalletProductsGD();
            resetEwalletInputsGD();
        }
    });

    document.getElementById('btnBackEwalletGD')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCaraBeliEwalletGD')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup GoPay Driver',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>Nomor HP</b> yang terdaftar di aplikasi Gojek Driver / GoPartner.</li>
                    <li>Periksa lagi nomornya, pastikan <b>sudah benar</b> sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Saldo</b> yang diinginkan.</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                    <li>Saldo akan otomatis masuk ke aplikasi Driver Anda.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#27ae60; background:#e8f5e9; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-triangle-exclamation"></i> PENTING:</b> Pastikan nomor yang dimasukkan adalah nomor khusus <b>Pengemudi/Driver</b>, bukan akun customer Gojek biasa.
                </div>
            `,
            confirmButtonText: 'Oke, Paham',
            confirmButtonColor: '#00aa13'
        });
    });

    document.getElementById('btnBuyEwalletGD')?.addEventListener('click', () => {
        if (!selectedEwalletDataGD || !selectedMethodEwalletGD) {
            checkOrderEwalletGD();
            return;
        }
        document.getElementById('ce-phone-gd').innerText = checkedEwalletUserGD.number;
        document.getElementById('ce-prod-gd').innerText = selectedEwalletDataGD.name;
        document.getElementById('ce-method-gd').innerText = selectedMethodEwalletGD.toUpperCase();
        document.getElementById('ce-total-gd').innerText = 'Rp ' + getFinalPriceByPage('ewallet-gd').toLocaleString();
        fillBuyerInfoForModal('confirmEwalletModalGD');
        document.getElementById('confirmEwalletModalGD').classList.add('show');
    });

    document.getElementById('btnCloseConfirmEwalletGD')?.addEventListener('click', () => document.getElementById('confirmEwalletModalGD').classList.remove('show'));

    document.getElementById('btnFinalPayEwalletGD')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayEwalletGD');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    try {
        const res = await fetch('/api/buy-ewallet/gopay-driver', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedEwalletCodeGD,
                target: checkedEwalletUserGD.number,
                method: selectedMethodEwalletGD,
                promo_code: getPromoDataByPage('ewallet-gd') ? getPromoDataByPage('ewallet-gd').code : null,
                final_amount: getFinalPriceByPage('ewallet-gd')
            })
        });
        const data = await res.json();
        document.getElementById('confirmEwalletModalGD').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'TOPUP GOPAY DRIVER BERHASIL',
                    subjudul: 'Saldo GoPay Driver sedang diproses.',
                    iconHtml: '<img src="https://api.deline.web.id/seNZ6Uj3C2.png" style="width:60px;height:60px;border-radius:50%;border:3px solid #00aa13;">',
                    labelProduk: 'Nominal',
                    valueProduk: selectedEwalletDataGD ? selectedEwalletDataGD.name : '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalEwalletPriceGD,
                    total: data.amount || finalEwalletPriceGD,
                    cekWarna: '#00aa13',
                    cekIcon: '<i class="fas fa-wallet"></i>',
                    cekTeks: 'CEK STATUS TOPUP',
                    cekPesananFn: () => switchPage('transaksi')
                });
                resetEwalletInputsGD();
            } 
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    document.getElementById('btnGoEwalletGopay')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('ewallet-gopay');
            fetchEwalletProductsGopay();
            resetEwalletInputsGopay();
        }
    });

    document.getElementById('btnBackEwalletGopay')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCaraBeliEwalletGopay')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup GoPay',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>Nomor HP</b> yang terdaftar di aplikasi Gojek.</li>
                    <li>Periksa lagi nomornya, pastikan <b>sudah benar</b> sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Saldo</b> yang diinginkan (Pilih paket Promo jika ada).</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#2980b9; background:#e3f2fd; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-lightbulb"></i> Tips:</b> Manfaatkan paket promo (GJK) untuk mendapatkan harga yang lebih murah!
                </div>
            `,
            confirmButtonText: 'Oke, Paham',
            confirmButtonColor: '#00aedd'
        });
    });

    document.getElementById('btnBuyEwalletGopay')?.addEventListener('click', function() {
        if (!selectedEwalletDataGopay || !selectedMethodEwalletGopay) {
            checkOrderEwalletGopay();
            return;
        }
        if (!checkedEwalletUserGopay) {
            Swal.fire('Error', 'Masukkan nomor GoPay yang valid!', 'warning');
            return;
        }

        document.getElementById('ce-phone-gopay').innerText = checkedEwalletUserGopay.number || '-';
        document.getElementById('ce-prod-gopay').innerText = selectedEwalletDataGopay.name || '-';
        document.getElementById('ce-method-gopay').innerText = getMetodeLabel(selectedMethodEwalletGopay) || '-';
        document.getElementById('ce-total-gopay').innerText = 'Rp ' + getFinalPriceByPage('ewallet-gopay').toLocaleString();

        fillBuyerInfoForModal('confirmEwalletModalGopay');
        document.getElementById('confirmEwalletModalGopay').classList.add('show');
    });

    document.getElementById('btnCloseConfirmEwalletGopay')?.addEventListener('click', () => {
        document.getElementById('confirmEwalletModalGopay').classList.remove('show');
    });

    document.getElementById('btnFinalPayEwalletGopay')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayEwalletGopay');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    try {
        const res = await fetch('/api/buy-ewallet/gopay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedEwalletCodeGopay,
                target: checkedEwalletUserGopay.number,
                method: selectedMethodEwalletGopay,
                promo_code: getPromoDataByPage('ewallet-gopay') ? getPromoDataByPage('ewallet-gopay').code : null,
                final_amount: getFinalPriceByPage('ewallet-gopay')
            })
        });
        const data = await res.json();
        document.getElementById('confirmEwalletModalGopay').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'TOPUP GOPAY BERHASIL',
                    subjudul: 'Saldo GoPay Customer sedang diproses.',
                    iconHtml: '<img src="https://api.deline.web.id/2nnwaEpb4o.jpeg" style="width:60px;height:60px;border-radius:50%;border:3px solid #00aedd;">',
                    labelProduk: 'Nominal',
                    valueProduk: selectedEwalletDataGopay ? selectedEwalletDataGopay.name : '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalEwalletPriceGopay,
                    total: data.amount || finalEwalletPriceGopay,
                    cekWarna: '#00aedd',
                    cekIcon: '<i class="fas fa-wallet"></i>',
                    cekTeks: 'CEK STATUS TOPUP',
                    cekPesananFn: () => switchPage('transaksi')
                });
                resetEwalletInputsGopay();
            } 
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    document.getElementById('btnCloseMetodePopup')?.addEventListener('click', closeMetodePopup);
    document.getElementById('btnBatalMetode')?.addEventListener('click', closeMetodePopup);
    document.getElementById('btnPilihMetode')?.addEventListener('click', () => {
        if (metodePopupContext && metodePopupContext.onSelect) {
            metodePopupContext.onSelect(metodePopupPending);
        }
        closeMetodePopup();
    });

    // FF: baris metode di halaman & di dalam popup Rincian, dua-duanya buka popup metode yang sama
    const openFFMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodGame,
            onSelect: (key) => selectPayMethodGame(key)
        });
    };
    document.getElementById('metodeRowGame')?.addEventListener('click', openFFMetode);
    document.getElementById('cgMetodeRow')?.addEventListener('click', openFFMetode);

    // ML: sama persis
    const openMLMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodML,
            onSelect: (key) => selectPayMethodML(key)
        });
    };
    document.getElementById('metodeRowGameML')?.addEventListener('click', openMLMetode);
    document.getElementById('cgmlMetodeRow')?.addEventListener('click', openMLMetode);

    // ===== METODE POPUP WIRING UNTUK SEMUA HALAMAN LAIN (sama pola kayak FF/ML) =====
    const openPanelMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethod,
            onSelect: (key) => selectPayMethod(key)
        });
    };
    document.getElementById('metodeRowPanel')?.addEventListener('click', openPanelMetode);
    document.getElementById('rincianMetodeRowPanel')?.addEventListener('click', openPanelMetode);

    const openScriptMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodScript,
            onSelect: (key) => selectPayMethodScript(key)
        });
    };
    document.getElementById('metodeRowScript')?.addEventListener('click', openScriptMetode);
    document.getElementById('rincianMetodeRowScript')?.addEventListener('click', openScriptMetode);

    const openMuridMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodMurid,
            onSelect: (key) => selectPayMethodMurid(key)
        });
    };
    document.getElementById('metodeRowMurid')?.addEventListener('click', openMuridMetode);
    document.getElementById('rincianMetodeRowMurid')?.addEventListener('click', openMuridMetode);

    const openVPSMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodVPS,
            onSelect: (key) => selectPayMethodVPS(key)
        });
    };
    document.getElementById('metodeRowVPS')?.addEventListener('click', openVPSMetode);
    document.getElementById('rincianMetodeRowVPS')?.addEventListener('click', openVPSMetode);

    const openSosmedMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodSosmed,
            onSelect: (key) => selectPayMethodSosmed(key)
        });
    };
    document.getElementById('metodeRowSosmed')?.addEventListener('click', openSosmedMetode);
    document.getElementById('rincianMetodeRowSosmed')?.addEventListener('click', openSosmedMetode);

    const openSubMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodSub,
            onSelect: (key) => selectPayMethodSub(key)
        });
    };
    document.getElementById('metodeRowSub')?.addEventListener('click', openSubMetode);
    document.getElementById('rincianMetodeRowSub')?.addEventListener('click', openSubMetode);

    const openEwalletMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodEwallet,
            onSelect: (key) => selectPayMethodEwallet(key)
        });
    };
    document.getElementById('metodeRowEwallet')?.addEventListener('click', openEwalletMetode);
    document.getElementById('rincianMetodeRowEwallet')?.addEventListener('click', openEwalletMetode);

    const openEwalletGDMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodEwalletGD,
            onSelect: (key) => selectPayMethodEwalletGD(key)
        });
    };
    document.getElementById('metodeRowEwalletGD')?.addEventListener('click', openEwalletGDMetode);
    document.getElementById('rincianMetodeRowEwalletGD')?.addEventListener('click', openEwalletGDMetode);

    const openEwalletGopayMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodEwalletGopay,
            onSelect: (key) => selectPayMethodEwalletGopay(key)
        });
    };
    document.getElementById('metodeRowEwalletGopay')?.addEventListener('click', openEwalletGopayMetode);
    document.getElementById('rincianMetodeRowEwalletGopay')?.addEventListener('click', openEwalletGopayMetode);

    const openOvoMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodOvo,
            onSelect: (key) => selectPayMethodOvo(key)
        });
    };
    document.getElementById('metodeRowOvo')?.addEventListener('click', openOvoMetode);
    document.getElementById('rincianMetodeRowOvo')?.addEventListener('click', openOvoMetode);

    const openShopeeMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodShopee,
            onSelect: (key) => selectPayMethodShopee(key)
        });
    };
    document.getElementById('metodeRowShopee')?.addEventListener('click', openShopeeMetode);
    document.getElementById('rincianMetodeRowShopee')?.addEventListener('click', openShopeeMetode);

    const openLinkajaMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodLinkaja,
            onSelect: (key) => selectPayMethodLinkaja(key)
        });
    };
    document.getElementById('metodeRowLinkaja')?.addEventListener('click', openLinkajaMetode);
    document.getElementById('rincianMetodeRowLinkaja')?.addEventListener('click', openLinkajaMetode);

    const openAstrapayMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodAstrapay,
            onSelect: (key) => selectPayMethodAstrapay(key)
        });
    };
    document.getElementById('metodeRowAstrapay')?.addEventListener('click', openAstrapayMetode);
    document.getElementById('rincianMetodeRowAstrapay')?.addEventListener('click', openAstrapayMetode);

    const openIsakuMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodIsaku,
            onSelect: (key) => selectPayMethodIsaku(key)
        });
    };
    document.getElementById('metodeRowIsaku')?.addEventListener('click', openIsakuMetode);
    document.getElementById('rincianMetodeRowIsaku')?.addEventListener('click', openIsakuMetode);

    const openKasproMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodKaspro,
            onSelect: (key) => selectPayMethodKaspro(key)
        });
    };
    document.getElementById('metodeRowKaspro')?.addEventListener('click', openKasproMetode);
    document.getElementById('rincianMetodeRowKaspro')?.addEventListener('click', openKasproMetode);

    const openBebasMetode = () => {
        openMetodePopup({
            options: [{ key: 'saldo', name: 'Saldo Akun', icon: 'fa-wallet', sub: 'Otomatis Proses' }],
            current: selectedMethodBebas,
            onSelect: (key) => selectPayMethodBebas(key)
        });
    };
    document.getElementById('metodeRowBebas')?.addEventListener('click', openBebasMetode);
    document.getElementById('rincianMetodeRowBebas')?.addEventListener('click', openBebasMetode);

    document.getElementById('btnGoGame')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('game-ff');
            fetchGameProductsFF();
            resetGameInputs();
        }
    });

    document.getElementById('btnBackGame')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnGoGameML')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('game-ml');
            fetchGameProductsML();
            resetMLInputs();
        }
    });

    document.getElementById('btnBackGameML')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCaraBeliGameML')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup Mobile Legends',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>User ID</b> dan <b>Zone ID</b> Mobile Legends Anda.</li>
                    <li>Kami <b>tidak mengecek nickname</b>, jadi pastikan ID & Zone ID sudah benar sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Diamond</b> atau <b>Membership</b> yang diinginkan.</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                    <li>Diamond akan masuk otomatis ke akun Anda.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#8a6d3b; background:#fff8e1; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-triangle-exclamation"></i> Catatan:</b> Kesalahan User ID / Zone ID bukan tanggung jawab kami dan diamond tidak bisa dikembalikan.
                </div>
            `,
            confirmButtonText: 'Oke Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyGameML')?.addEventListener('click', () => {
        const userId = document.getElementById('mlUserId')?.value.trim();
        const zoneId = document.getElementById('mlZoneId')?.value.trim();
        const mlData = selectedMLData || selectedMLMembershipData;

        if (!userId || !zoneId || !mlData || !selectedMethodML) {
            checkOrderML();
            return;
        }
        document.getElementById('cgml-id').innerText = userId;
        document.getElementById('cgml-zone').innerText = zoneId;
        document.getElementById('cgml-prod').innerText = mlData.name;
        document.getElementById('cgml-method').innerText = getMetodeLabel(selectedMethodML);
        const finalMLPrice = getFinalPriceByPage('game-ml');
        document.getElementById('cgml-total').innerText = 'Rp ' + finalMLPrice.toLocaleString();

        fillBuyerInfoForModal('confirmGameMLModal');
        document.getElementById('confirmGameMLModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmGameML')?.addEventListener('click', () => {
        document.getElementById('confirmGameMLModal').classList.remove('show');
    });

    document.getElementById('btnFinalPayGameML')?.addEventListener('click', async () => {
        const { token, user } = checkLogin();
        const btn = document.getElementById('btnFinalPayGameML');
        const originalText = btn.innerText;
        btn.innerText = "Memproses...";
        btn.disabled = true;

        const finalMLPrice = getFinalPriceByPage('game-ml');
        const promoDataML = getPromoDataByPage('game-ml');
        const mlData = selectedMLData || selectedMLMembershipData;
        const mlCode = selectedMLCode || selectedMLMembershipCode;
        const userId = document.getElementById('mlUserId')?.value.trim();
        const zoneId = document.getElementById('mlZoneId')?.value.trim();

        try {
            const res = await fetch('/api/buy-game/ml', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    product_code: mlCode,
                    user_id: userId,
                    zone_id: zoneId,
                    method: selectedMethodML,
                    promo_code: promoDataML ? promoDataML.code : null,
                    final_amount: finalMLPrice
                })
            });
            const data = await res.json();
            document.getElementById('confirmGameMLModal').classList.remove('show');

            // CEK APAKAH USER PERLU UPDATE NOMOR WA
            if (data.requirePhone) {
                btn.innerText = originalText;
                btn.disabled = false;
                Swal.fire({
                    title: 'Lengkapi Nomor WhatsApp',
                    text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                    icon: 'warning',
                    confirmButtonText: 'Update Sekarang',
                    confirmButtonColor: '#2ecc71'
                }).then(() => {
                    switchPage('akun');
                });
                return;
            }
            // ===============================================

            if (data.success) {
                if (data.type === 'instant') {
                    showPurchaseSuccessPage({
                        judul: 'TOPUP ML BERHASIL',
                        subjudul: `Pesanan untuk ID ${userId} (${zoneId}) sedang diproses.`,
                        iconHtml: '<i class="fas fa-gamepad" style="color:var(--primary-color);"></i>',
                        labelProduk: 'Produk Game',
                        valueProduk: mlData ? mlData.name : '-',
                        labelNominal: 'Harga',
                        nominal: data.amount || finalMLPrice,
                        total: data.amount || finalMLPrice,
                        cekWarna: '#e74c3c',
                        cekIcon: '<i class="fas fa-gamepad"></i>',
                        cekTeks: 'CEK STATUS TOPUP',
                        cekPesananFn: () => switchPage('transaksi')
                    });
                    resetMLInputs();
                }
            } else {
                Swal.fire('Gagal', data.message, 'error');
            }
        } catch (e) {
            console.log(e);
            Swal.fire('Error', 'Gagal terhubung ke server', 'error');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById('btnCaraBeliGame')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup Game',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>ID Pemain</b> Free Fire Anda.</li>
                    <li>Kami <b>tidak mengecek nickname</b>, jadi pastikan ID sudah benar sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Diamond</b> yang diinginkan.</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                    <li>Diamond akan masuk otomatis ke akun Anda.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#8a6d3b; background:#fff8e1; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-triangle-exclamation"></i> Catatan:</b> Kesalahan User ID bukan tanggung jawab kami dan diamond tidak bisa dikembalikan.
                </div>
            `,
            confirmButtonText: 'Oke Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyGame')?.addEventListener('click', () => {
        const gameUserId = document.getElementById('gameUserId')?.value.trim();
        if (!gameUserId || !selectedGameData || !selectedMethodGame) {
            checkOrderGame();
            return;
        }
        document.getElementById('cg-id').innerText = gameUserId;
        document.getElementById('cg-prod').innerText = selectedGameData.name;
        document.getElementById('cg-method').innerText = getMetodeLabel(selectedMethodGame);
        const finalGamePrice = getFinalPriceByPage('game');
        document.getElementById('cg-total').innerText = 'Rp ' + finalGamePrice.toLocaleString();

        fillBuyerInfoForModal('confirmGameModal');
        document.getElementById('confirmGameModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmGame')?.addEventListener('click', () => {
        document.getElementById('confirmGameModal').classList.remove('show');
    });

    document.getElementById('btnFinalPayGame')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayGame');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const finalGamePrice = getFinalPriceByPage('game');
    const promoDataGame = getPromoDataByPage('game');
    const gameUserId = document.getElementById('gameUserId')?.value.trim();

    try {
        const res = await fetch('/api/buy-game/ff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedGameCode,
                target: gameUserId,
                method: selectedMethodGame,
                promo_code: promoDataGame ? promoDataGame.code : null,
                final_amount: finalGamePrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmGameModal').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'TOPUP GAME BERHASIL',
                    subjudul: `Pesanan untuk ID ${gameUserId} sedang diproses.`,
                    iconHtml: '<i class="fas fa-gamepad" style="color:var(--primary-color);"></i>',
                    labelProduk: 'Produk Game',
                    valueProduk: selectedGameData ? selectedGameData.name : '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalGamePrice,
                    total: data.amount || finalGamePrice,
                    cekWarna: '#e74c3c',
                    cekIcon: '<i class="fas fa-gamepad"></i>',
                    cekTeks: 'CEK STATUS TOPUP',
                    cekPesananFn: () => switchPage('transaksi')
                });
                resetGameInputs();
            } 
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        console.log(e);
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    // OVO
    document.getElementById('btnGoOvo')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('ewallet-ovo');
            fetchOvoProducts();
            resetOvoInputs();
        }
    });

    document.getElementById('btnBackOvo')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCaraBeliOvo')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup OVO',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>Nomor OVO</b> Anda.</li>
                    <li>Periksa lagi nomornya, pastikan <b>sudah benar</b> sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Topup</b> yang diinginkan.</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                    <li>Saldo akan masuk otomatis ke akun OVO Anda.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#e74c3c; background:#ffebee; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-triangle-exclamation"></i> Catatan:</b> Pastikan nomor yang dimasukkan sudah benar dan terdaftar di OVO. Kesalahan nomor bukan tanggung jawab kami.
                </div>
            `,
            confirmButtonText: 'Oke Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyOvo')?.addEventListener('click', function() {
        if (!selectedOvoData || !selectedMethodOvo) {
            checkOrderOvo();
            return;
        }
        if (!checkedOvoUser) {
            Swal.fire('Error', 'Masukkan nomor OVO yang valid!', 'warning');
            return;
        }

        document.getElementById('co-name').innerText = checkedOvoUser.name || '-';
        document.getElementById('co-phone').innerText = checkedOvoUser.number || '-';
        document.getElementById('co-prod').innerText = selectedOvoData.name || '-';
        document.getElementById('co-method').innerText = getMetodeLabel(selectedMethodOvo) || '-';

        const finalOvoPrice = getFinalPriceByPage('ewallet-ovo');
        document.getElementById('co-total').innerText = 'Rp ' + (finalOvoPrice || 0).toLocaleString();

        fillBuyerInfoForModal('confirmOvoModal');
        document.getElementById('confirmOvoModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmOvo')?.addEventListener('click', () => {
        document.getElementById('confirmOvoModal').classList.remove('show');
    });

    document.getElementById('btnFinalPayOvo')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayOvo');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const finalOvoPrice = getFinalPriceByPage('ewallet-ovo');
    const promoDataOvo = getPromoDataByPage('ewallet-ovo');

    try {
        const res = await fetch('/api/buy-ewallet/ovo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedOvoCode,
                target: checkedOvoUser.number,
                method: selectedMethodOvo,
                promo_code: promoDataOvo ? promoDataOvo.code : null,
                final_amount: finalOvoPrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmOvoModal').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'TOPUP OVO BERHASIL',
                    subjudul: `Saldo OVO untuk ${checkedOvoUser ? checkedOvoUser.name : '-'} sedang diproses.`,
                    iconHtml: '<img src="https://img.icons8.com/color/96/ovo.png" style="width:60px;height:60px;border-radius:50%;border:3px solid #7047A0;">',
                    labelProduk: 'Nominal',
                    valueProduk: selectedOvoData ? selectedOvoData.name : '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalOvoPrice,
                    total: data.amount || finalOvoPrice,
                    cekWarna: '#7047A0',
                    cekIcon: '<i class="fas fa-wallet"></i>',
                    cekTeks: 'CEK STATUS TOPUP',
                    cekPesananFn: () => switchPage('transaksi')
                });
                resetOvoInputs();
            } 
        } else {
            Swal.fire('Gagal', data.message, 'error');
            if (data.refund) {
                loadUserData();
            }
        }
    } catch (e) {
        console.log(e);
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    // ShopeePay
    document.getElementById('btnGoShopee')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('ewallet-shopee');
            fetchShopeeProducts();
            resetShopeeInputs();
        }
    });

    document.getElementById('btnBackShopee')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCaraBeliShopee')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup ShopeePay',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>Nomor ShopeePay</b> Anda.</li>
                    <li>Periksa lagi nomornya, pastikan <b>sudah benar</b> sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Topup</b> yang diinginkan (SHP = Produk Admin, SHOPE = Reguler).</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                    <li>Saldo akan masuk otomatis ke akun ShopeePay Anda.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#e74c3c; background:#ffebee; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-triangle-exclamation"></i> Catatan:</b> Pastikan nomor yang dimasukkan sudah benar dan terdaftar di ShopeePay. Kesalahan nomor bukan tanggung jawab kami.
                </div>
            `,
            confirmButtonText: 'Oke Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyShopee')?.addEventListener('click', function() {
        if (!selectedShopeeData || !selectedMethodShopee) {
            checkOrderShopee();
            return;
        }
        if (!checkedShopeeUser) {
            Swal.fire('Error', 'Masukkan nomor ShopeePay yang valid!', 'warning');
            return;
        }

        document.getElementById('cs-name').innerText = checkedShopeeUser.name || '-';
        document.getElementById('cs-phone').innerText = checkedShopeeUser.number || '-';
        document.getElementById('cs-prod').innerText = selectedShopeeData.name || '-';
        document.getElementById('cs-method').innerText = getMetodeLabel(selectedMethodShopee) || '-';
        const finalShopeePrice = getFinalPriceByPage('ewallet-shopee');
        document.getElementById('cs-total').innerText = 'Rp ' + (finalShopeePrice || 0).toLocaleString();

        fillBuyerInfoForModal('confirmShopeeModal');
        document.getElementById('confirmShopeeModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmShopee')?.addEventListener('click', () => {
        document.getElementById('confirmShopeeModal').classList.remove('show');
    });

    document.getElementById('btnFinalPayShopee')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayShopee');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const finalShopeePrice = getFinalPriceByPage('ewallet-shopee');
    const promoDataShopee = getPromoDataByPage('ewallet-shopee');

    try {
        const res = await fetch('/api/buy-ewallet/shopee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedShopeeCode,
                target: checkedShopeeUser.number,
                method: selectedMethodShopee,
                promo_code: promoDataShopee ? promoDataShopee.code : null,
                final_amount: finalShopeePrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmShopeeModal').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'TOPUP SHOPEEPAY BERHASIL',
                    subjudul: `Saldo ShopeePay untuk ${checkedShopeeUser ? checkedShopeeUser.name : '-'} sedang diproses.`,
                    iconHtml: '<img src="https://img.icons8.com/color/96/shopee.png" style="width:60px;height:60px;border-radius:50%;border:3px solid #ee4d2d;">',
                    labelProduk: 'Nominal',
                    valueProduk: selectedShopeeData ? selectedShopeeData.name : '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalShopeePrice,
                    total: data.amount || finalShopeePrice,
                    cekWarna: '#ee4d2d',
                    cekIcon: '<i class="fas fa-wallet"></i>',
                    cekTeks: 'CEK STATUS TOPUP',
                    cekPesananFn: () => switchPage('transaksi')
                });
                resetShopeeInputs();
            } 
        } else {
            Swal.fire('Gagal', data.message, 'error');
            if (data.refund) {
                loadUserData();
            }
        }
    } catch (e) {
        console.log(e);
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    // LinkAja
    document.getElementById('btnGoLinkaja')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('ewallet-linkaja');
            fetchLinkajaProducts();
            resetLinkajaInputs();
        }
    });

    document.getElementById('btnBackLinkaja')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCaraBeliLinkaja')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup LinkAja',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>Nomor LinkAja</b> Anda.</li>
                    <li>Periksa lagi nomornya, pastikan <b>sudah benar</b> sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Topup</b> yang diinginkan (LJAE = Entitas, LINK = Reguler).</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                    <li>Saldo akan masuk otomatis ke akun LinkAja Anda.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#e74c3c; background:#ffebee; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-triangle-exclamation"></i> Catatan:</b> Pastikan nomor yang dimasukkan sudah benar dan terdaftar di LinkAja. Kesalahan nomor bukan tanggung jawab kami.
                </div>
            `,
            confirmButtonText: 'Oke Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyLinkaja')?.addEventListener('click', function() {
        if (!selectedLinkajaData || !selectedMethodLinkaja) {
            checkOrderLinkaja();
            return;
        }
        if (!checkedLinkajaUser) {
            Swal.fire('Error', 'Masukkan nomor LinkAja yang valid!', 'warning');
            return;
        }

        document.getElementById('cl-name').innerText = checkedLinkajaUser.name || '-';
        document.getElementById('cl-phone').innerText = checkedLinkajaUser.number || '-';
        document.getElementById('cl-prod').innerText = selectedLinkajaData.name || '-';
        document.getElementById('cl-method').innerText = getMetodeLabel(selectedMethodLinkaja) || '-';
        const finalLinkajaPrice = getFinalPriceByPage('ewallet-linkaja');
        document.getElementById('cl-total').innerText = 'Rp ' + (finalLinkajaPrice || 0).toLocaleString();

        fillBuyerInfoForModal('confirmLinkajaModal');
        document.getElementById('confirmLinkajaModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmLinkaja')?.addEventListener('click', () => {
        document.getElementById('confirmLinkajaModal').classList.remove('show');
    });

    document.getElementById('btnFinalPayLinkaja')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayLinkaja');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const finalLinkajaPrice = getFinalPriceByPage('ewallet-linkaja');
    const promoDataLinkaja = getPromoDataByPage('ewallet-linkaja');

    try {
        const res = await fetch('/api/buy-ewallet/linkaja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedLinkajaCode,
                target: checkedLinkajaUser.number,
                method: selectedMethodLinkaja,
                promo_code: promoDataLinkaja ? promoDataLinkaja.code : null,
                final_amount: finalLinkajaPrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmLinkajaModal').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'TOPUP LINKAJA BERHASIL',
                    subjudul: `Saldo LinkAja untuk ${checkedLinkajaUser ? checkedLinkajaUser.name : '-'} sedang diproses.`,
                    iconHtml: '<img src="https://api.deline.web.id/wCXLHdBsPw.png" style="width:60px;height:60px;border-radius:50%;border:3px solid #0055a0;">',
                    labelProduk: 'Nominal',
                    valueProduk: selectedLinkajaData ? selectedLinkajaData.name : '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalLinkajaPrice,
                    total: data.amount || finalLinkajaPrice,
                    cekWarna: '#0055a0',
                    cekIcon: '<i class="fas fa-wallet"></i>',
                    cekTeks: 'CEK STATUS TOPUP',
                    cekPesananFn: () => switchPage('transaksi')
                });
                resetLinkajaInputs();
            } 
        } else {
            Swal.fire('Gagal', data.message, 'error');
            if (data.refund) {
                loadUserData();
            }
        }
    } catch (e) {
        console.log(e);
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    // Astrapay
    document.getElementById('btnGoAstrapay')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('ewallet-astrapay');
            fetchAstrapayProducts();
            resetAstrapayInputs();
        }
    });

    document.getElementById('btnBackAstrapay')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCaraBeliAstrapay')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup Astrapay',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>Nomor Astrapay</b> Anda.</li>
                    <li>Periksa lagi nomornya, pastikan <b>sudah benar</b> sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Topup</b> yang diinginkan.</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                    <li>Saldo akan masuk otomatis ke akun Astrapay Anda.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#e74c3c; background:#ffebee; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-triangle-exclamation"></i> Catatan:</b> Pastikan nomor yang dimasukkan sudah benar dan terdaftar di Astrapay. Kesalahan nomor bukan tanggung jawab kami.
                </div>
            `,
            confirmButtonText: 'Oke Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyAstrapay')?.addEventListener('click', function() {
        if (!selectedAstrapayData || !selectedMethodAstrapay) {
            checkOrderAstrapay();
            return;
        }
        if (!checkedAstrapayUser) {
            Swal.fire('Error', 'Masukkan nomor Astrapay yang valid!', 'warning');
            return;
        }

        document.getElementById('ca-name').innerText = checkedAstrapayUser.name || '-';
        document.getElementById('ca-phone').innerText = checkedAstrapayUser.number || '-';
        document.getElementById('ca-prod').innerText = selectedAstrapayData.name || '-';
        document.getElementById('ca-method').innerText = getMetodeLabel(selectedMethodAstrapay) || '-';
        const finalAstrapayPrice = getFinalPriceByPage('ewallet-astrapay');
        document.getElementById('ca-total').innerText = 'Rp ' + (finalAstrapayPrice || 0).toLocaleString();

        fillBuyerInfoForModal('confirmAstrapayModal');
        document.getElementById('confirmAstrapayModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmAstrapay')?.addEventListener('click', () => {
        document.getElementById('confirmAstrapayModal').classList.remove('show');
    });

    document.getElementById('btnFinalPayAstrapay')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayAstrapay');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const finalAstrapayPrice = getFinalPriceByPage('ewallet-astrapay');
    const promoDataAstrapay = getPromoDataByPage('ewallet-astrapay');

    try {
        const res = await fetch('/api/buy-ewallet/astrapay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedAstrapayCode,
                target: checkedAstrapayUser.number,
                method: selectedMethodAstrapay,
                promo_code: promoDataAstrapay ? promoDataAstrapay.code : null,
                final_amount: finalAstrapayPrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmAstrapayModal').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'TOPUP ASTRAPAY BERHASIL',
                    subjudul: `Saldo AstraPay untuk ${checkedAstrapayUser ? checkedAstrapayUser.name : '-'} sedang diproses.`,
                    iconHtml: '<img src="https://api.deline.web.id/R87kIeNath.jpeg" style="width:60px;height:60px;border-radius:50%;border:3px solid #e31b23;">',
                    labelProduk: 'Nominal',
                    valueProduk: selectedAstrapayData ? selectedAstrapayData.name : '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalAstrapayPrice,
                    total: data.amount || finalAstrapayPrice,
                    cekWarna: '#e31b23',
                    cekIcon: '<i class="fas fa-wallet"></i>',
                    cekTeks: 'CEK STATUS TOPUP',
                    cekPesananFn: () => switchPage('transaksi')
                });
                resetAstrapayInputs();
            } 
        } else {
            Swal.fire('Gagal', data.message, 'error');
            if (data.refund) {
                loadUserData();
            }
        }
    } catch (e) {
        console.log(e);
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    // iSaku
    document.getElementById('btnGoIsaku')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('ewallet-isaku');
            fetchIsakuProducts();
            resetIsakuInputs();
        }
    });

    document.getElementById('btnBackIsaku')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCaraBeliIsaku')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup iSaku',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>Nomor iSaku</b> Anda.</li>
                    <li>Periksa lagi nomornya, pastikan <b>sudah benar</b> sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Topup</b> yang diinginkan.</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                    <li>Saldo akan masuk otomatis ke akun iSaku Anda.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#e74c3c; background:#ffebee; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-triangle-exclamation"></i> Catatan:</b> Pastikan nomor yang dimasukkan sudah benar dan terdaftar di iSaku. Kesalahan nomor bukan tanggung jawab kami.
                </div>
            `,
            confirmButtonText: 'Oke Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyIsaku')?.addEventListener('click', function() {
        if (!selectedIsakuData || !selectedMethodIsaku) {
            checkOrderIsaku();
            return;
        }
        if (!checkedIsakuUser) {
            Swal.fire('Error', 'Masukkan nomor iSaku yang valid!', 'warning');
            return;
        }

        document.getElementById('ci-name').innerText = checkedIsakuUser.name || '-';
        document.getElementById('ci-phone').innerText = checkedIsakuUser.number || '-';
        document.getElementById('ci-prod').innerText = selectedIsakuData.name || '-';
        document.getElementById('ci-method').innerText = getMetodeLabel(selectedMethodIsaku) || '-';
        const finalIsakuPrice = getFinalPriceByPage('ewallet-isaku');
        document.getElementById('ci-total').innerText = 'Rp ' + (finalIsakuPrice || 0).toLocaleString();

        fillBuyerInfoForModal('confirmIsakuModal');
        document.getElementById('confirmIsakuModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmIsaku')?.addEventListener('click', () => {
        document.getElementById('confirmIsakuModal').classList.remove('show');
    });

    document.getElementById('btnFinalPayIsaku')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayIsaku');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const finalIsakuPrice = getFinalPriceByPage('ewallet-isaku');
    const promoDataIsaku = getPromoDataByPage('ewallet-isaku');

    try {
        const res = await fetch('/api/buy-ewallet/isaku', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedIsakuCode,
                target: checkedIsakuUser.number,
                method: selectedMethodIsaku,
                promo_code: promoDataIsaku ? promoDataIsaku.code : null,
                final_amount: finalIsakuPrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmIsakuModal').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'TOPUP ISAKU BERHASIL',
                    subjudul: `Saldo iSaku untuk ${checkedIsakuUser ? checkedIsakuUser.name : '-'} sedang diproses.`,
                    iconHtml: '<img src="https://api.deline.web.id/wlBGiEQtuX.png" style="width:60px;height:60px;border-radius:50%;border:3px solid #ed1c24;">',
                    labelProduk: 'Nominal',
                    valueProduk: selectedIsakuData ? selectedIsakuData.name : '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalIsakuPrice,
                    total: data.amount || finalIsakuPrice,
                    cekWarna: '#ed1c24',
                    cekIcon: '<i class="fas fa-wallet"></i>',
                    cekTeks: 'CEK STATUS TOPUP',
                    cekPesananFn: () => switchPage('transaksi')
                });
                resetIsakuInputs();
            } 
        } else {
            Swal.fire('Gagal', data.message, 'error');
            if (data.refund) {
                loadUserData();
            }
        }
    } catch (e) {
        console.log(e);
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    // Kaspro
    document.getElementById('btnGoKaspro')?.addEventListener('click', () => {
        if (!checkLogin().token) window.location.href = '/login';
        else {
            switchPage('ewallet-kaspro');
            fetchKasproProducts();
            resetKasproInputs();
        }
    });

    document.getElementById('btnBackKaspro')?.addEventListener('click', () => switchPage('home'));

    document.getElementById('btnCaraBeliKaspro')?.addEventListener('click', () => {
        Swal.fire({
            title: 'Cara Topup Kaspro',
            html: `
                <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6; color:#555;">
                    <li>Masukkan <b>Nomor Kaspro</b> Anda.</li>
                    <li>Periksa lagi nomornya, pastikan <b>sudah benar</b> sebelum lanjut.</li>
                    <li>Pilih <b>Nominal Topup</b> yang diinginkan.</li>
                    <li>Pilih Pembayaran & Bayar.</li>
                    <li>Saldo akan masuk otomatis ke akun Kaspro Anda.</li>
                </ol>
                <div style="margin-top:10px; font-size:12px; color:#e74c3c; background:#ffebee; padding:10px; border-radius:6px;">
                    <b><i class="fas fa-triangle-exclamation"></i> Catatan:</b> Pastikan nomor yang dimasukkan sudah benar dan terdaftar di Kaspro. Kesalahan nomor bukan tanggung jawab kami.
                </div>
            `,
            confirmButtonText: 'Oke Paham',
            confirmButtonColor: 'var(--primary-color)'
        });
    });

    document.getElementById('btnBuyKaspro')?.addEventListener('click', function() {
        if (!selectedKasproData || !selectedMethodKaspro) {
            checkOrderKaspro();
            return;
        }
        if (!checkedKasproUser) {
            Swal.fire('Error', 'Masukkan nomor Kaspro yang valid!', 'warning');
            return;
        }

        document.getElementById('ck-name').innerText = checkedKasproUser.name || '-';
        document.getElementById('ck-phone').innerText = checkedKasproUser.number || '-';
        document.getElementById('ck-prod').innerText = selectedKasproData.name || '-';
        document.getElementById('ck-method').innerText = getMetodeLabel(selectedMethodKaspro) || '-';
        const finalKasproPrice = getFinalPriceByPage('ewallet-kaspro');
        document.getElementById('ck-total').innerText = 'Rp ' + (finalKasproPrice || 0).toLocaleString();

        fillBuyerInfoForModal('confirmKasproModal');
        document.getElementById('confirmKasproModal').classList.add('show');
    });

    document.getElementById('btnCloseConfirmKaspro')?.addEventListener('click', () => {
        document.getElementById('confirmKasproModal').classList.remove('show');
    });

    document.getElementById('btnFinalPayKaspro')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayKaspro');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;

    const finalKasproPrice = getFinalPriceByPage('ewallet-kaspro');
    const promoDataKaspro = getPromoDataByPage('ewallet-kaspro');

    try {
        const res = await fetch('/api/buy-ewallet/kaspro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedKasproCode,
                target: checkedKasproUser.number,
                method: selectedMethodKaspro,
                promo_code: promoDataKaspro ? promoDataKaspro.code : null,
                final_amount: finalKasproPrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmKasproModal').classList.remove('show');

        // CEK APAKAH USER PERLU UPDATE NOMOR WA
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        // ===============================================

        if (data.success) {
            if (data.type === 'instant') {
                showPurchaseSuccessPage({
                    judul: 'TOPUP KASPRO BERHASIL',
                    subjudul: `Saldo Kaspro untuk ${checkedKasproUser ? checkedKasproUser.name : '-'} sedang diproses.`,
                    iconHtml: '<img src="https://api.deline.web.id/il3T6M0giR.png" style="width:60px;height:60px;border-radius:50%;border:3px solid #ff6b35;">',
                    labelProduk: 'Nominal',
                    valueProduk: selectedKasproData ? selectedKasproData.name : '-',
                    labelNominal: 'Harga',
                    nominal: data.amount || finalKasproPrice,
                    total: data.amount || finalKasproPrice,
                    cekWarna: '#ff6b35',
                    cekIcon: '<i class="fas fa-wallet"></i>',
                    cekTeks: 'CEK STATUS TOPUP',
                    cekPesananFn: () => switchPage('transaksi')
                });
                resetKasproInputs();
            }
        } else {
            Swal.fire('Gagal', data.message, 'error');
            if (data.refund) {
                loadUserData();
            }
        }
    } catch (e) {
        console.log(e);
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

    document.getElementById('kasproPhone')?.addEventListener('input', checkKasproInput);
    document.getElementById('isakuPhone')?.addEventListener('input', checkIsakuInput);
    document.getElementById('astrapayPhone')?.addEventListener('input', checkAstrapayInput);
    document.getElementById('linkajaPhone')?.addEventListener('input', checkLinkajaInput);
    document.getElementById('shopeePhone')?.addEventListener('input', checkShopeeInput);
    document.getElementById('ovoPhone')?.addEventListener('input', checkOvoInput);
    document.getElementById('ewalletPhone')?.addEventListener('input', checkEwalletInput);
    document.getElementById('ewalletPhoneGopay')?.addEventListener('input', checkEwalletInputGopay);
    document.getElementById('gameUserId')?.addEventListener('input', checkGameInput);
    
 document.getElementById('bebasNominal')?.addEventListener('input', function() {
    calculateBebasTotal();
  });
}

// ============ HANDLE HASH ============
if (window.location.hash === '#panelPopup') {
    window.history.replaceState(null, null, ' ')
    setTimeout(() => {
        if (document.getElementById('menuPanelPopup')) {
            document.getElementById('menuPanelPopup').click()
        }
    }, 800)
}

if (window.location.hash === '#subdomainSaya') {
    window.history.replaceState(null, null, ' ')
    setTimeout(() => {
        if (document.getElementById('menuSubdomainSaya')) {
            document.getElementById('menuSubdomainSaya').click()
        }
    }, 800)
}

// ============ PENANGANAN CLOSE MODAL ============
document.getElementById('btnCloseConfirmOvo')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('confirmOvoModal').classList.remove('show');
});

const modalOvoOverlay = document.getElementById('confirmOvoModal');
if (modalOvoOverlay) {
    modalOvoOverlay.addEventListener('click', (e) => {
        if (e.target === modalOvoOverlay) {
            modalOvoOverlay.classList.remove('show');
        }
    });
}

// ============ ACCORDION MENU ============
function setupAccordion() {
    const headers = document.querySelectorAll('.accordion-header');
    
    headers.forEach(header => {
        const content = header.nextElementSibling;
        if (!content || !content.classList.contains('accordion-content')) return;
        const stateKey = 'accordion_state_' + header.id;

        header.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            header.classList.toggle('active');
            content.classList.toggle('show');
            localStorage.setItem(stateKey, content.classList.contains('show'));
        };
        const isOpen = localStorage.getItem(stateKey) === 'true';
        if (isOpen) {
            header.classList.add('active');
            content.classList.add('show');
        } else {
            header.classList.remove('active');
            content.classList.remove('show');
        }
    });
}

// ==========================================
// ============ SISTEM EVENT HARI SPESIAL (POPUP APK) ============
// ==========================================
function startSpecialDayCountdown() {
    // Banner hari spesial sekarang ditangani /promo-banner.js (SVG bawaan, tema otomatis sesuai tanggal)
    if (window.RikiPromoHero && typeof window.RikiPromoHero.start === 'function') window.RikiPromoHero.start();
}

document.addEventListener('DOMContentLoaded', () => {
    startSpecialDayCountdown();
    setupQRISStatisEvents();
});
// ========================================= //
// TEMA ADAPTIF & TERSIMPAN PERMANEN (FIX KLIK & DEFAULT TERANG)
// ========================================= //
document.addEventListener("DOMContentLoaded", () => {
    const oldThemeToggle = document.getElementById("themeToggle");
    const body = document.body;

    if (oldThemeToggle) {
        const themeToggle = oldThemeToggle.cloneNode(true);
        oldThemeToggle.parentNode.replaceChild(themeToggle, oldThemeToggle);
        const savedTheme = localStorage.getItem("theme");
        
        if (savedTheme === "dark") {
            body.classList.add("dark-mode");
            themeToggle.classList.replace("fa-moon", "fa-sun");
        } else {
            body.classList.remove("dark-mode");
            localStorage.setItem("theme", "light"); 
            themeToggle.classList.replace("fa-sun", "fa-moon");
        }
        themeToggle.addEventListener("click", () => {
            body.classList.toggle("dark-mode");
            if (body.classList.contains("dark-mode")) {
                localStorage.setItem("theme", "dark"); 
                themeToggle.classList.replace("fa-moon", "fa-sun");
            } else {
                localStorage.setItem("theme", "light"); 
                themeToggle.classList.replace("fa-sun", "fa-moon");
            }
        });
    }
});

// ==========================================
// FUNGSI FILTER KATEGORI CODEX
// ==========================================
function filterCategory(categoryName, btnElement) {
    const allBtns = document.querySelectorAll('.cat-btn');
    allBtns.forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    const allCategories = document.querySelectorAll('.item-kategori');

    allCategories.forEach(item => {
        if (categoryName === 'all') {
            item.style.display = 'block'; 
        } else {
            if (item.classList.contains(categoryName)) {
                item.style.display = 'block'; 
            } else {
                item.style.display = 'none';
            }
        }
    });
}

// ==========================================
// ANIMASI SCROLL OTOMATIS (0% LAG)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const elementsToAnimate = document.querySelectorAll('.saldo-wrapper, .stats-container, .banner-section, .codex-category-container, .product-container, .panel-hero, .step-box');
    
    elementsToAnimate.forEach(el => {
        el.classList.add('animate-on-scroll');
    });

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                obs.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.05,
        rootMargin: "0px 0px -10px 0px"
    });

    // Pakai requestIdleCallback agar tidak blokir rendering awal
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
        });
    } else {
        document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
    }
});

// ==========================================
// FITUR EVENT GACHA
// ==========================================
document.getElementById('menuGacha')?.addEventListener('click', () => {
    closeSidebar();
    switchPage('gacha');
    loadUserDataGacha(); 
});

// ==========================================
// FITUR HALAMAN APK
// ==========================================
// ==========================================
// KHUSUS APK: menu Top Sultan & Ulasan + penanda ulasan baru
// ==========================================
(function () {
    const KEY = 'rm_ulasan_seen';          // waktu ulasan terbaru yang sudah dilihat di perangkat ini
    const menuTop = document.getElementById('menuTopSultan');
    const menuUlasan = document.getElementById('menuUlasan');
    const badge = document.getElementById('badgeUlasan');
    const burger = document.getElementById('btnOpenSidebar');
    let latest = 0;

    function show(n) {
        n = Number(n) || 0;
        if (badge) { badge.textContent = n > 99 ? '99+' : String(n); badge.classList.toggle('show', n > 0); }
        if (burger) burger.classList.toggle('has-new', n > 0);
    }
    async function check() {
        if (!window.RM_IS_APP || !menuUlasan) return;
        try {
            const seenRaw = localStorage.getItem(KEY);
            const r = await fetch('/api/reviews/new-count?since=' + (seenRaw === null ? 0 : parseInt(seenRaw, 10) || 0), { cache: 'no-store' });
            const d = await r.json();
            if (!d.success) return;
            latest = Number(d.latest) || 0;
            if (seenRaw === null) { localStorage.setItem(KEY, String(latest)); show(0); return; }   // pertama kali: ulasan lama dianggap sudah dibaca
            show(d.count);
        } catch (e) {}
    }

    menuTop?.addEventListener('click', () => { closeSidebar(); window.location.href = '/top-sultan'; });
    menuUlasan?.addEventListener('click', () => {
        closeSidebar();
        try { if (latest) localStorage.setItem(KEY, String(latest)); } catch (e) {}
        show(0);
        window.location.href = '/ulasan';
    });

    if (window.RM_IS_APP && menuUlasan) {
        check();
        setInterval(check, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }
})();

document.getElementById('menuApk')?.addEventListener('click', () => {
    closeSidebar();
    if (window.RM_IS_APP) return;   // di dalam APK, fitur download APK tidak dipakai
    switchPage('apk');
});

document.getElementById('btnBackGacha')?.addEventListener('click', () => {
    document.querySelectorAll('.page-section').forEach(el => {
        el.classList.remove('active');
        el.style.display = '';
    });
    switchPage('home');
});

// ---------- GACHA: RODA BERPUTAR ----------
const GW = { items: [], segs: [], angle: 0, spinning: false, loaded: false };
const GW_COLORS = ['#2196F3', '#FFB300', '#00C853', '#FF5252', '#7C4DFF', '#00BCD4', '#FF6D00', '#EC407A'];
const GW_DEFAULT = [{ name: 'Saldo Random', type: 'saldo' }];

function gwEsc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function gwLabel(name) {
    name = String(name).split(',')[0].trim();
    return name.length > 12 ? name.slice(0, 11) + '…' : name;
}

function gwRender(items) {
    GW.items = (items && items.length) ? items : GW_DEFAULT;
    const n = GW.items.length;
    const copies = Math.max(1, Math.ceil(8 / n));
    GW.segs = [];
    for (let c = 0; c < copies; c++) GW.items.forEach((it, idx) => GW.segs.push({ idx, name: it.name }));

    const S = GW.segs.length, a = 360 / S, cx = 150, cy = 150, r = 150;
    const pt = (deg, rad) => {
        const t = deg * Math.PI / 180;
        return [cx + rad * Math.sin(t), cy - rad * Math.cos(t)];
    };
    let svg = '<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">';
    GW.segs.forEach((sg, i) => {
        const [x1, y1] = pt(i * a, r), [x2, y2] = pt((i + 1) * a, r);
        const mid = (i + 0.5) * a;
        const [tx, ty] = pt(mid, 98);
        svg += `<path d="M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${GW_COLORS[i % GW_COLORS.length]}" stroke="#fff" stroke-width="2"/>`;
        svg += `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" transform="rotate(${(mid - 90).toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)})" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="13" font-weight="800" font-family="sans-serif" style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2px;">${gwEsc(gwLabel(sg.name))}</text>`;
    });
    svg += '</svg>';
    const wheel = document.getElementById('gwWheel');
    if (wheel) {
        wheel.innerHTML = svg;
        wheel.style.transition = 'none';
        wheel.style.transform = `rotate(${GW.angle}deg)`;
    }
}

async function gwInit() {
    if (GW.loaded) return;
    try {
        const res = await fetch('/api/gacha/prizes');
        const d = await res.json();
        gwRender(d.success ? d.data : GW_DEFAULT);
        GW.loaded = true;
    } catch (e) {
        gwRender(GW_DEFAULT);
    }
}

function gwSpinTo(segIndex) {
    const S = GW.segs.length, a = 360 / S;
    const jitter = (Math.random() - 0.5) * a * 0.6;
    const target = 360 - ((segIndex + 0.5) * a + jitter);
    const cur = ((GW.angle % 360) + 360) % 360;
    const delta = (((target - cur) % 360) + 360) % 360;
    GW.angle += 360 * 6 + delta;
    const wheel = document.getElementById('gwWheel');
    wheel.style.transition = 'transform 5s cubic-bezier(.12,.6,.1,1)';
    wheel.style.transform = `rotate(${GW.angle}deg)`;
}

function gwSetBusy(busy) {
    GW.spinning = busy;
    const b = document.getElementById('btnPlayGacha');
    const c = document.getElementById('gwCenter');
    if (b) { b.disabled = busy; b.innerHTML = busy ? '<i class="fas fa-spinner fa-spin"></i> Memutar...' : '<i class="fas fa-rotate"></i> Putar Roda &middot; 1 Poin'; }
    if (c) c.disabled = busy;
}

async function loadUserDataGacha() {
    gwInit();
    const { token } = checkLogin();
    if (!token) return;
    try {
        const res = await fetch('/api/get-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.success && data.user) {
            const userPoints = data.user.points || 0;
            document.getElementById('displayPoinGacha').innerHTML = `${userPoints} <small>Pts</small>`;
        }
    } catch (e) {
        console.log("Gagal load poin:", e);
    }
}

async function gwPlay() {
    if (GW.spinning) return;
    const { token } = checkLogin();
    if (!token) {
        Swal.fire('Login Dulu', 'Kamu harus login untuk memutar gacha!', 'warning');
        return;
    }
    if (!GW.segs.length) await gwInit();
    gwSetBusy(true);

    let data;
    try {
        const res = await fetch('/api/gacha', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        data = await res.json();
    } catch (e) {
        gwSetBusy(false);
        Swal.fire('Error', 'Koneksi ke server gagal', 'error');
        return;
    }
    if (!data.success) {
        gwSetBusy(false);
        Swal.fire({ icon: 'error', title: 'Waduh...', text: data.message, confirmButtonColor: '#e74c3c' });
        return;
    }

    // cari potongan roda yang cocok dengan hadiah dari server
    let cand = [];
    GW.segs.forEach((sg, i) => { if (sg.idx === data.prize_index) cand.push(i); });
    if (!cand.length) GW.segs.forEach((sg, i) => { if (sg.name === data.prize) cand.push(i); });
    const segIndex = cand.length ? cand[Math.floor(Math.random() * cand.length)] : Math.floor(Math.random() * GW.segs.length);
    gwSpinTo(segIndex);

    setTimeout(() => {
        let iconBox = '<i class="fas fa-money-bill-wave" style="color:#2ecc71;"></i>';
        let titleText = 'SELAMAT!';
        let extraHtml = '';
        if (data.jenis !== 'saldo') {
            iconBox = '<i class="fas fa-gem" style="color:#3498db;"></i>';
            titleText = 'SUPER JACKPOT!';
            extraHtml = '<div style="margin-top:15px; font-size:11px; color:#fff; background:rgba(231, 76, 60, 0.9); padding:10px; border-radius:8px; border:1px dashed #f1c40f;"><i class="fas fa-triangle-exclamation"></i> Screenshot layar ini & kirim ke WhatsApp Admin untuk mengklaim hadiahmu!</div>';
        }
        Swal.fire({
            title: `<span style="color:#f1c40f; font-weight:900; font-size:26px;">${titleText}</span>`,
            html: `
                <div style="font-size: 70px; margin: 5px 0; animation: boxTada 1s;">${iconBox}</div>
                <div style="font-size: 13px; color: #ecf0f1; margin-bottom:8px;">Kamu berhasil mendapatkan:</div>
                <div style="font-size: 18px; font-weight: bold; color: #2ecc71; padding:12px; background:rgba(46, 204, 113, 0.15); border-radius:10px; border:1px solid #2ecc71;">${gwEsc(data.prize)}</div>
                ${extraHtml}
            `,
            confirmButtonText: 'MANTAP!',
            confirmButtonColor: '#f39c12',
            customClass: { popup: 'swal-gacha-dark' }
        });
        document.getElementById('displayPoinGacha').innerHTML = `${data.sisa_points} <small>Pts</small>`;
        gwSetBusy(false);
        loadUserData();
    }, 5300);
}
document.getElementById('btnPlayGacha')?.addEventListener('click', gwPlay);
document.getElementById('gwCenter')?.addEventListener('click', gwPlay);
document.addEventListener('DOMContentLoaded', () => { gwInit(); });

// ==========================================
// FITUR BAGI THR (gaya DANA Kaget)
// ==========================================
function dkMoney(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function dkEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dkInit(name) { return dkEsc(String(name || '?').trim().charAt(0).toUpperCase() || '?'); }
const thrEl = id => document.getElementById(id);

function thrTotalVal() { return parseInt(String(thrEl('thrTotal')?.value || '').replace(/\D/g, '')) || 0; }
function thrWinnersVal() { return Math.max(1, Math.min(1000, parseInt(thrEl('thrWinners')?.value) || 1)); }

function thrSummary() {
    const box = thrEl('thrSummary');
    if (!box) return;
    const total = thrTotalVal(), n = thrWinnersVal(), type = thrEl('thrType').value;
    if (!total) { box.textContent = 'Isi total dan jumlah penerima.'; return; }
    if (type === 'equal') box.textContent = `Tiap orang dapat ± ${dkMoney(Math.floor(total / n))}`;
    else box.textContent = `${n} orang dapat jumlah berbeda-beda (acak) dari ${dkMoney(total)}`;
}

async function thrLoadSaldo() {
    const { token } = checkLogin();
    if (!token) return;
    try {
        const res = await fetch('/api/get-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
        const d = await res.json();
        if (d.success && d.user) thrEl('thrSaldo').textContent = dkMoney(d.user.balance);
    } catch (e) {}
}

document.getElementById('menuThr')?.addEventListener('click', () => {
    closeSidebar();
    switchPage('thr');
    thrEl('thrResultBox').style.display = 'none';
    thrLoadSaldo();
    thrSummary();
});
document.getElementById('btnBackThr')?.addEventListener('click', () => {
    document.querySelectorAll('.page-section').forEach(el => {
        el.classList.remove('active');
        el.style.display = '';
    });
    switchPage('home');
});

thrEl('thrTotal')?.addEventListener('input', e => {
    const v = thrTotalVal();
    e.target.value = v ? v.toLocaleString('id-ID') : '';
    thrSummary();
});
document.querySelectorAll('.dk-chip[data-amt]').forEach(b => b.addEventListener('click', () => {
    thrEl('thrTotal').value = Number(b.dataset.amt).toLocaleString('id-ID');
    thrSummary();
}));
thrEl('thrMinus')?.addEventListener('click', () => { thrEl('thrWinners').value = Math.max(1, thrWinnersVal() - 1); thrSummary(); });
thrEl('thrPlus')?.addEventListener('click', () => { thrEl('thrWinners').value = Math.min(1000, thrWinnersVal() + 1); thrSummary(); });
thrEl('thrWinners')?.addEventListener('input', thrSummary);
document.querySelectorAll('#thrSeg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#thrSeg button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    thrEl('thrType').value = b.dataset.type;
    thrSummary();
}));

document.getElementById('btnCreateThr')?.addEventListener('click', async () => {
    const { token } = checkLogin();
    if (!token) return Swal.fire('Error', 'Silakan login dulu', 'warning');

    const total = thrTotalVal();
    const winners = thrWinnersVal();
    const type = thrEl('thrType').value;
    const message = (thrEl('thrMessage').value || '').trim();

    if (!total || total < 1000) return Swal.fire('Oops', 'Total THR minimal Rp 1.000.', 'error');
    if (total < winners) return Swal.fire('Oops', 'Total THR kurang untuk jumlah penerima segitu.', 'error');

    const btn = thrEl('btnCreateThr');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/thr/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, total_amount: total, max_winners: winners, type, message })
        });
        const data = await res.json();

        if (data.success) {
            thrEl('thrLinkResult').value = window.location.origin + '/dasboard#thr-' + data.code;
            thrEl('thrResultBox').style.display = 'flex';
            thrEl('thrTotal').value = '';
            thrSummary();
            thrLoadSaldo();
            loadUserData();
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Koneksi gagal', 'error');
    } finally {
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim THR';
        btn.disabled = false;
    }
});

function copyThrLink() {
    copyToClipboard(thrEl('thrLinkResult').value);
}
thrEl('btnShareThr')?.addEventListener('click', async () => {
    const link = thrEl('thrLinkResult').value;
    if (navigator.share) {
        try { await navigator.share({ title: 'THR Kaget', text: 'Ada THR buat kamu! Buka link ini sebelum keduluan 🎁', url: link }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    copyToClipboard(link);
});
thrEl('btnCloseThrSheet')?.addEventListener('click', () => { thrEl('thrResultBox').style.display = 'none'; });

// ---------- OVERLAY KLAIM THR ----------
function dkClaimClose() {
    document.getElementById('thrClaimOverlay')?.remove();
    loadUserData();
}
function dkClaimMount(inner) {
    let ov = document.getElementById('thrClaimOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'thrClaimOverlay';
        ov.className = 'dk-claim';
        document.body.appendChild(ov);
    }
    ov.innerHTML = '<button type="button" class="dk-claim-x" onclick="dkClaimClose()"><i class="fas fa-times"></i></button>' + inner;
}
function dkClaimIntro(code) {
    dkClaimMount(`
        <div class="dk-envbig"><i class="fas fa-envelope-open-text"></i></div>
        <h2>Ada THR buat kamu!</h2>
        <p>Buka amplopnya sebelum keduluan orang lain</p>
        <button type="button" class="dk-open" id="dkOpenBtn">BUKA</button>
    `);
    document.getElementById('dkOpenBtn').addEventListener('click', () => claimThrKaget(code));
}
function dkWinnersHtml(winners, isRandom) {
    if (!winners || !winners.length) {
        return '<div class="dk-list"><h4>Daftar penerima</h4><div style="text-align:center;color:var(--text-sub);font-size:12px;padding:8px;">Belum ada yang mengklaim.</div></div>';
    }
    const max = Math.max(...winners.map(w => w.amount));
    let rows = winners.map(w => {
        const best = (isRandom && winners.length > 1 && w.amount === max) ? '<span class="dk-best">Terbanyak</span>' : '';
        const t = w.date ? new Date(w.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="dk-row"><div class="dk-ava">${dkInit(w.fullname)}</div><div class="dk-row-n">${dkEsc(w.fullname)}${best}<small>${t}</small></div><div class="dk-row-a">${dkMoney(w.amount)}</div></div>`;
    }).join('');
    return `<div class="dk-list"><h4><i class="fas fa-users"></i> Daftar penerima (${winners.length})</h4>${rows}</div>`;
}

window.claimThrKaget = async function (thrCode) {
    const { token } = checkLogin();
    const btn = document.getElementById('dkOpenBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
        const res = await fetch('/api/thr/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, code: thrCode })
        });
        const data = await res.json();
        const isRandom = data.thr_type !== 'equal';
        if (data.success) {
            dkClaimMount(`
                <div class="dk-from"><div class="dk-ava">${dkInit(data.creator)}</div>THR dari ${dkEsc(data.creator)}</div>
                <p style="margin-top:26px;">Kamu dapat</p>
                <div class="dk-win-amt">${dkMoney(data.amount)}</div>
                <p>Saldo sudah masuk ke akunmu 🎉</p>
                ${data.greeting ? `<div class="dk-greet">“${dkEsc(data.greeting)}”</div>` : ''}
                ${dkWinnersHtml(data.winners, isRandom)}
                <button type="button" class="dk-cta" style="max-width:440px;margin-top:18px;background:#fff;color:#1565C0;box-shadow:none;" onclick="dkClaimClose()">Tutup</button>
            `);
            loadUserData();
        } else {
            dkClaimMount(`
                <div class="dk-sad"><i class="fas fa-face-sad-tear"></i></div>
                ${data.creator ? `<div class="dk-from"><div class="dk-ava">${dkInit(data.creator)}</div>THR dari ${dkEsc(data.creator)}</div>` : ''}
                <h2 style="font-size:17px;line-height:1.4;">${dkEsc(data.message)}</h2>
                ${data.winners ? dkWinnersHtml(data.winners, isRandom) : ''}
                <button type="button" class="dk-cta" style="max-width:440px;margin-top:18px;background:#fff;color:#1565C0;box-shadow:none;" onclick="dkClaimClose()">Tutup</button>
            `);
        }
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'BUKA'; }
        Swal.fire('Error', 'Gagal membuka amplop', 'error');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.location.hash.startsWith('#thr-')) {
            const thrCode = window.location.hash.replace('#thr-', '');
            window.history.replaceState(null, null, ' ');
            const promoApk = document.getElementById('promoApkModal');
            if (promoApk) {
                promoApk.classList.remove('show');
                promoApk.style.display = 'none';
            }
            const { token } = checkLogin();
            if (!token) {
                Swal.fire('Login Diperlukan', 'Kamu harus login atau daftar dulu untuk mengambil THR ini!', 'warning')
                    .then(() => window.location.href = '/login');
                return;
            }
            dkClaimIntro(thrCode);
        }
    }, 1000);
});

// ==========================================
// MODAL RIWAYAT & DAFTAR PEMENANG THR
// ==========================================
document.getElementById('btnRiwayatThr')?.addEventListener('click', () => {
    document.getElementById('modalRiwayatThr').classList.add('show');
    loadRiwayatThr();
});

document.getElementById('btnCloseRiwayatThr')?.addEventListener('click', () => {
    document.getElementById('modalRiwayatThr').classList.remove('show');
});

async function loadRiwayatThr() {
    const container = document.getElementById('listRiwayatThr');
    container.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin"></i> Memuat data...</div>';
    
    const { token } = checkLogin();
    if (!token) return container.innerHTML = '<div style="text-align:center; padding:20px;">Silakan login dulu.</div>';

    try {
        const res = await fetch('/api/thr/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        
        if (data.success && data.data.length > 0) {
            let html = '';
            data.data.forEach(thr => {
                const isExpired = (new Date() - new Date(thr.created_at)) > 24 * 60 * 60 * 1000;
                let statusBadge = '<span style="color:#2ecc71; font-weight:bold; font-size:10px; border:1px solid #2ecc71; padding:2px 5px; border-radius:10px;">Aktif</span>';
                
                if (thr.is_refunded) {
                    statusBadge = '<span style="color:#e74c3c; font-weight:bold; font-size:10px; border:1px solid #e74c3c; padding:2px 5px; border-radius:10px;">Telah Direfund</span>';
                } else if (isExpired && thr.remaining_amount > 0) {
                    statusBadge = '<span style="color:#f39c12; font-weight:bold; font-size:10px; border:1px solid #f39c12; padding:2px 5px; border-radius:10px;">Proses Refund...</span>';
                } else if (thr.remaining_amount <= 0) {
                    statusBadge = '<span style="color:#95a5a6; font-weight:bold; font-size:10px; border:1px solid #95a5a6; padding:2px 5px; border-radius:10px;">Ludes</span>';
                }

                let winnersHtml = '';
                if (thr.claimed_by && thr.claimed_by.length > 0) {
                    thr.claimed_by.forEach((w, index) => {
                        winnersHtml += `
                        <div style="display:flex; justify-content:space-between; font-size:11px; padding:5px 0; border-bottom:1px dashed #eee;">
                            <span>${index+1}. <i class="fas fa-user"></i> ${w.username}</span>
                            <span style="color:#2ecc71; font-weight:bold;">+Rp ${w.amount.toLocaleString()}</span>
                        </div>`;
                    });
                } else {
                    winnersHtml = '<div style="font-size:11px; color:#999; text-align:center; padding:5px;">Belum ada yang klaim</div>';
                }

                html += `
                <div style="background:#f9f9f9; border:1px solid #ddd; border-radius:8px; padding:12px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">
                        <strong style="color:#e74c3c; font-size:13px;"><i class="fas fa-envelope"></i> ${thr.code}</strong>
                        ${statusBadge}
                    </div>
                    <div style="font-size:12px; margin-bottom:5px; color:#555;">
                        Dibuat: ${new Date(thr.created_at).toLocaleDateString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}
                    </div>
                    <div style="font-size:12px; margin-bottom:5px;">
                        Total Saldo: <b style="color:#333;">Rp ${thr.total_amount.toLocaleString()}</b>
                    </div>
                    <div style="font-size:12px; margin-bottom:10px; display:flex; justify-content:space-between;">
                        <span>Sisa: <b style="color:#e74c3c;">Rp ${thr.remaining_amount.toLocaleString()}</b></span>
                        <span>Kuota: <b>${thr.claimed_by.length}/${thr.max_winners} Orang</b></span>
                    </div>
                    <div style="background:#fff; border:1px solid #eee; border-radius:5px; padding:8px;">
                        <div style="font-size:11px; font-weight:bold; color:#555; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:5px;">
                            <i class="fas fa-trophy" style="color:#f1c40f;"></i> Daftar Pemenang:
                        </div>
                        ${winnersHtml}
                    </div>
                </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div style="text-align:center; padding:30px; color:#999;">Kamu belum pernah membuat THR.</div>';
        }
    } catch (e) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#e74c3c;">Gagal memuat data.</div>';
    }
}

async function togglePanelType() {
    const type = document.getElementById('panelOrderType').value;
    const wrapNew = document.getElementById('wrapNewPanel');
    const wrapAdd = document.getElementById('wrapAddPanel');
    const selectExisting = document.getElementById('existingPanelUser');

    if (type === 'new') {
        wrapNew.style.display = 'block';
        wrapAdd.style.display = 'none';
        checkOrder();
    } else {
        wrapNew.style.display = 'none';
        wrapAdd.style.display = 'block';
        
        selectExisting.innerHTML = '<option value="">Memuat data panel...</option>';
        try {
            const { token } = checkLogin();
            const res = await fetch('/api/get-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const d = await res.json();
            if (d.success && d.user.panels && d.user.panels.length > 0) {
                const uniqueUsernames = [...new Set(d.user.panels.map(item => item.username_panel))];
                selectExisting.innerHTML = '<option value="">-- Pilih Akun Panel Kamu --</option>';
                uniqueUsernames.forEach(uname => {
                    selectExisting.innerHTML += `<option value="${uname}">${uname}</option>`;
                });
            } else {
                selectExisting.innerHTML = '<option value="">Anda belum punya panel</option>';
            }
        } catch (e) {
            selectExisting.innerHTML = '<option value="">Gagal memuat data</option>';
        }
        checkOrder();
    }
}

document.getElementById('existingPanelUser')?.addEventListener('change', checkOrder);

// ============ PWA INSTALL HANDLER ============
let deferredPrompt;

function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function setupInstallButtons() {
    const installBtn = document.getElementById('installBtn');
    const installBtnManual = document.getElementById('installBtnManual');
    const installBtnInstalled = document.getElementById('installBtnInstalled');

    if (!installBtn && !installBtnManual && !installBtnInstalled) return;

    // Kalau sudah terinstall (dibuka dari ikon homescreen), tampilkan status "sudah terinstall"
    if (isStandaloneMode()) {
        if (installBtn) installBtn.style.display = 'none';
        if (installBtnManual) installBtnManual.style.display = 'none';
        if (installBtnInstalled) installBtnInstalled.style.display = 'flex';
        return;
    }

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (isIOS) {
        // iOS Safari tidak support beforeinstallprompt, jadi tampilkan instruksi manual
        if (installBtnManual) {
            installBtnManual.style.display = 'flex';
            installBtnManual.addEventListener('click', () => {
                Swal.fire({
                    title: 'Cara Install Aplikasi',
                    html: `
                        <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.8;">
                            <li>Tap ikon <b>Share</b> <i class="fas fa-share-square"></i> di Safari (bawah/atas layar).</li>
                            <li>Pilih <b>"Add to Home Screen"</b> / "Tambah ke Layar Utama".</li>
                            <li>Tap <b>"Add"</b> / "Tambah" di pojok kanan atas.</li>
                            <li>Selesai! Ikon RikiMarket muncul di Homescreen.</li>
                        </ol>
                    `,
                    confirmButtonText: 'Oke Paham'
                });
            });
        }
        return;
    }

    // Android Chrome & browser lain yang support beforeinstallprompt
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) {
                // Event belum sempat tertangkap (misal sudah pernah ditolak sebelumnya)
                Swal.fire({
                    title: 'Cara Install Aplikasi',
                    html: `
                        <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.8;">
                            <li>Tap ikon menu <b>⋮</b> (titik tiga) di kanan atas Chrome.</li>
                            <li>Pilih <b>"Add to Home screen"</b> / "Tambahkan ke layar utama".</li>
                            <li>Tap <b>"Install"</b> / "Tambahkan".</li>
                        </ol>
                    `,
                    confirmButtonText: 'Oke Paham'
                });
                return;
            }
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('User install PWA');
                if (installBtn) installBtn.style.display = 'none';
                if (installBtnInstalled) installBtnInstalled.style.display = 'flex';
            }
            deferredPrompt = null;
        });
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('installBtn');
  const installBtnManual = document.getElementById('installBtnManual');
  if (installBtn && !isStandaloneMode()) installBtn.style.display = 'flex';
  if (installBtnManual) installBtnManual.style.display = 'none';
});

window.addEventListener('appinstalled', () => {
  const installBtn = document.getElementById('installBtn');
  const installBtnInstalled = document.getElementById('installBtnInstalled');
  if (installBtn) installBtn.style.display = 'none';
  if (installBtnInstalled) installBtnInstalled.style.display = 'flex';
  deferredPrompt = null;
});

document.addEventListener('DOMContentLoaded', setupInstallButtons);
if (document.readyState !== 'loading') setupInstallButtons();

// Tambahkan CSS animasi untuk efek kedip tombol
const pulseStyle = document.createElement('style');
pulseStyle.innerHTML = `
    @keyframes pulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7); }
        70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(33, 150, 243, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); }
    }
`;
document.head.appendChild(pulseStyle);

// === FUNGSI KIRIM OTP EMAIL BARU ===
document.getElementById('btnSendEmailOtp')?.addEventListener('click', async () => {
    const email = document.getElementById('newEmailInput').value;
    if (!email || !email.includes('@')) return Swal.fire('Error', 'Format email tidak valid!', 'error');

    const btn = document.getElementById('btnSendEmailOtp');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';
    btn.disabled = true;

    try {
        const { token } = checkLogin();
        const res = await fetch('/api/send-verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, email })
        });
        const data = await res.json();

        if (data.success) {
            Swal.fire('Cek Email', data.message, 'success');
            btn.style.display = 'none';
            document.getElementById('otpEmailSection').style.display = 'block';
            document.getElementById('newEmailInput').setAttribute('readonly', 'true');
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Gagal terhubung ke server', 'error');
    } finally {
        btn.innerHTML = 'Kirim Kode OTP';
        btn.disabled = false;
    }
});

// === FUNGSI KONFIRMASI OTP EMAIL ===
document.getElementById('btnConfirmEmailOtp')?.addEventListener('click', async () => {
    const otp = document.getElementById('emailOtpInput').value;
    if (!otp) return Swal.fire('Error', 'Masukkan kode OTP!', 'warning');

    const btn = document.getElementById('btnConfirmEmailOtp');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengecek...';
    btn.disabled = true;

    try {
        const { token } = checkLogin();
        const res = await fetch('/api/confirm-verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, otp })
        });
        const data = await res.json();

        if (data.success) {
            Swal.fire('Berhasil', data.message, 'success');
            document.getElementById('verifyEmailModal').classList.remove('show');
            loadUserData(); // Perbarui state user dari backend
            setTimeout(() => {
                loadProfilePage(); // Refresh tampilan akun
            }, 500);
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Gagal terhubung ke server', 'error');
    } finally {
        btn.innerHTML = 'Verifikasi Email <i class="fas fa-check-circle"></i>';
        btn.disabled = false;
    }
});

// === EFEK TOMBOL BERUBAH HIJAU SAAT INPUT TERISI ===

// 1. Cek inputan Email
document.getElementById('newEmailInput')?.addEventListener('input', function() {
    const btn = document.getElementById('btnSendEmailOtp');
    const emailValue = this.value.trim();
    if (btn) {
        // PERUBAHAN: Sekarang tombol berubah hijau jika INPUT TIDAK KOSONG
        if (emailValue.length > 0) {
            btn.style.background = '#2ecc71';
            btn.style.color = '#fff';
            btn.style.transition = 'background 0.3s ease';
        } else {
            btn.style.background = '#95a5a6';
        }
    }
});

// 2. Cek inputan OTP
document.getElementById('emailOtpInput')?.addEventListener('input', function() {
    const btn = document.getElementById('btnConfirmEmailOtp');
    if (btn) {
        // Jika panjang OTP sudah 6 digit, tombol jadi hijau
        if (this.value.length >= 6) {
            btn.style.background = '#2ecc71'; 
            btn.style.color = '#fff';
            btn.style.transition = 'background 0.3s ease';
        } else {
            btn.style.background = '#95a5a6';
        }
    }
});

// ==========================================
// KODE BARU: EVENT LISTENER TOMBOL TELEGRAM
// ==========================================
document.getElementById('btnConnectTele')?.addEventListener('click', () => {
    Swal.fire({
        title: 'Hubungkan Telegram?',
        html: '<p style="font-size: 14px; color: var(--text-sub);">Sambungkan Telegram untuk menerima invoice dan notifikasi otomatis layaknya via WhatsApp.</p>',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Lanjutkan',
        cancelButtonText: 'Nanti Saja',
        confirmButtonColor: '#0088cc',
        cancelButtonColor: '#bdc3c7',
        reverseButtons: true
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'Mengarahkan...',
                text: 'Membuka Telegram, silakan klik tombol "Start / Mulai".',
                icon: 'success',
                timer: 3000,
                showConfirmButton: false
            });

            try {
                // Ambil token dari localStorage
                const token = localStorage.getItem('token'); 
                
                const res = await fetch('/api/telegram/generate-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const data = await res.json();
                
                if (data.success) {
                    setTimeout(() => {
                        window.location.href = data.link; 
                    }, 2000);
                } else {
                    Swal.fire('Gagal', data.message, 'error');
                }
            } catch (e) {
                Swal.fire('Error', 'Gagal terhubung ke server.', 'error');
            }
        }
    });
});

// Fetch produk bebas nominal
async function fetchBebasProducts() {
    const grid = document.getElementById('bebasProductGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Memuat produk...</div>';
    
    try {
        const res = await fetch('/api/ewallet/bebas/products');
        const json = await res.json();
        
        if (json.success && json.data.length > 0) {
            bebasProducts = json.data;
            renderBebasProducts();
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Gagal load produk.</div>';
        }
    } catch (e) {
        console.error(e);
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#e74c3c;">Error koneksi</div>';
    }
}

function renderBebasProducts() {
    const grid = document.getElementById('bebasProductGrid');
    grid.innerHTML = '';
    
    bebasProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.onclick = () => selectBebasProduct(card, p);
        card.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; text-align:center;">
                <i class="fas fa-money-bill-wave" style="font-size:28px; line-height:40px; height:40px; margin-bottom:8px; color:var(--primary-color);"></i>
                <span class="prod-name" style="font-size:13px;">${p.name}</span>
                <span class="prod-price" style="font-size:11px;">Admin: Rp ${p.price_per_unit.toLocaleString()}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function selectBebasProduct(el, data) {
    document.querySelectorAll('#bebasProductGrid .prod-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedBebasProduct = data;
    selectedBebasFee = data.price_per_unit;
    
    // Hitung ulang total
    calculateBebasTotal();
    
    // Tampilkan step pembayaran (promo sekarang ada di dalam popup Rincian)
    document.getElementById('bebasPayBox').style.display = 'block';
    document.getElementById('bebasStickyFooter').style.display = 'flex';
    
    // AUTO SCROLL ke step pembayaran
    setTimeout(() => {
        document.getElementById('bebasPayBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
}

function setBebasNominal(amount, element) {
    document.querySelectorAll('#bebasFormBox .preset-btn').forEach(btn => btn.classList.remove('active'));
    if (element) element.classList.add('active');
    document.getElementById('bebasNominal').value = amount;
    calculateBebasTotal();
}

function calculateBebasTotal() {
    let nominal = parseInt(document.getElementById('bebasNominal').value) || 0;
    if (nominal < 1000) nominal = 0;
    if (nominal > 1000000) nominal = 1000000;
    
    selectedBebasNominal = nominal;
    selectedBebasTotal = nominal + selectedBebasFee;
    
    updateBebasDisplay();
    checkOrderBebas();
    resetPromo('bebas');
}

function updateBebasDisplay() {
    document.getElementById('bebasDisplayNominal').innerText = 'Rp ' + selectedBebasNominal.toLocaleString();
    document.getElementById('bebasDisplayFee').innerText = 'Rp ' + selectedBebasFee.toLocaleString();
    document.getElementById('bebasDisplayTotal').innerText = 'Rp ' + selectedBebasTotal.toLocaleString();
    document.getElementById('footerPriceBebas').innerText = 'Rp ' + selectedBebasTotal.toLocaleString();
}

async function checkBebasNumber() {
    if (!selectedBebasNominal || selectedBebasNominal < 1000) {
        Swal.fire('Error', 'Masukkan nominal terlebih dahulu (min Rp 1.000)!', 'warning');
        return;
    }
    
    const phoneNumber = document.getElementById('bebasPhone').value;
    if (!phoneNumber) {
        Swal.fire('Error', 'Masukkan nomor terlebih dahulu!', 'warning');
        return;
    }
    
    const btn = document.getElementById('btnCheckBebas');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengecek...';
    btn.disabled = true;
    
    // Siapkan variable untuk timeout
    let timeoutId = setTimeout(() => {
        if (btn && btn.disabled) {
            btn.innerHTML = originalText;
            btn.disabled = false;
            Swal.fire('Info', 'Cek nama timeout, pastikan nomor sudah benar!', 'warning');
        }
    }, 7000);
    
    try {
        // Untuk sementara, kita skip panggilan API karena provider_code belum ada
        // Gunakan fallback
        const fallbackName = `User (${phoneNumber.slice(-4)})`;
        checkedBebasUser = { name: fallbackName, number: phoneNumber };
        document.getElementById('bebasName').innerText = fallbackName;
        document.getElementById('bebasUserInfo').style.display = 'flex';
        Swal.fire('Sukses', `Nomor terdaftar: ${fallbackName}`, 'success');
        
        // TAMPILKAN STEP 2 (PILIH E-WALLET)
        document.getElementById('bebasStep2').style.display = 'block';
        
        // AUTO SCROLL KE STEP 2
        setTimeout(() => {
            document.getElementById('bebasStep2').scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Highlight step 2
            const step2 = document.getElementById('bebasStep2');
            step2.style.transition = 'all 0.3s ease';
            step2.style.boxShadow = '0 0 0 2px var(--primary-color)';
            step2.style.backgroundColor = 'rgba(33, 150, 243, 0.05)';
            setTimeout(() => {
                step2.style.boxShadow = '';
                step2.style.backgroundColor = '';
            }, 1000);
        }, 500);
        
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Gagal mengecek nomor', 'error');
    } finally {
        clearTimeout(timeoutId);
        btn.innerHTML = originalText;
        btn.disabled = false;
        checkOrderBebas();
    }
}

function checkBebasInput() {
    const phone = document.getElementById('bebasPhone').value;
    if (phone.length >= 10) {
        if (!checkedBebasUser) {
            checkedBebasUser = { name: "Memuat...", number: phone };
        }
    } else {
        document.getElementById('bebasUserInfo').style.display = 'none';
        checkedBebasUser = null;
    }
    checkOrderBebas();
}

function selectPayMethodBebas(method) {
    selectedMethodBebas = method;
    const nameElBebas = document.getElementById('metodeNameBebas');
    if (nameElBebas) nameElBebas.innerText = getMetodeLabel(method);
    const rincianNameElBebas = document.getElementById('rincianMetodeNameBebas');
    if (rincianNameElBebas) rincianNameElBebas.innerText = getMetodeLabel(method);
    checkOrderBebas();
    setTimeout(() => scrollToBuyButton('ewallet-bebas'), 100);
}

function checkOrderBebas() {
    const btn = document.getElementById('btnBuyBebas');
    const alert = document.getElementById('footerAlertBebas');
    
    if (selectedBebasProduct && checkedBebasUser && selectedBebasNominal >= 1000 && selectedMethodBebas) {
        btn.classList.add('active');
        btn.disabled = false;
        alert.style.display = 'none';
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
        alert.style.display = 'flex';
        
        let msg = "Lengkapi data.";
        if (!selectedBebasProduct) msg = "Pilih e-wallet terlebih dahulu.";
        else if (!checkedBebasUser) msg = "Masukkan nomor e-wallet yang valid (08xxxxxxxxxx).";
        else if (selectedBebasNominal < 1000) msg = "Masukkan nominal (min Rp 1.000, max Rp 1.000.000).";
        else if (!selectedMethodBebas) msg = "Pilih pembayaran.";
        
        alert.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    }
}

function resetBebasInputs() {
    selectedBebasProduct = null;
    selectedBebasNominal = 0;
    selectedBebasFee = 0;
    selectedBebasTotal = 0;
    selectedMethodBebas = 'saldo';
    checkedBebasUser = null;
    
    document.getElementById('bebasProductGrid').innerHTML = '';
    document.getElementById('bebasStep2').style.display = 'none';
    document.getElementById('bebasPayBox').style.display = 'none';
    document.getElementById('bebasStickyFooter').style.display = 'none';
    document.getElementById('bebasPhone').value = '';
    document.getElementById('bebasNominal').value = '';
    document.getElementById('bebasUserInfo').style.display = 'none';
    
    // Reset juga step 1 display
    document.getElementById('bebasStep1').style.display = 'block';
}

// Event listeners untuk bebas nominal
document.getElementById('btnGoBebasNominal')?.addEventListener('click', () => {
    if (!checkLogin().token) window.location.href = '/login';
    else {
        switchPage('ewallet-bebas');
        fetchBebasProducts();
    }
});

document.getElementById('btnBackBebas')?.addEventListener('click', () => switchPage('home'));
document.getElementById('bebasNominal')?.addEventListener('input', calculateBebasTotal);
document.getElementById('bebasPhone')?.addEventListener('input', checkBebasInput);
document.getElementById('btnCheckBebas')?.addEventListener('click', checkBebasNumber);

document.getElementById('btnCaraBeliBebas')?.addEventListener('click', () => {
    Swal.fire({
        title: 'Cara Topup Bebas Nominal',
        html: `
            <ol style="text-align:left; font-size:13px; padding-left:20px; line-height:1.6;">
                <li>Pilih <b>E-Wallet</b> tujuan (DANA, OVO, GoPay, dll).</li>
                <li>Masukkan <b>Nomor E-Wallet</b> tujuan dengan benar.</li>
                <li>Pilih nominal cepat atau ketik <b>Nominal</b> sendiri (Min Rp 1.000, Max Rp 1.000.000).</li>
                <li>Biaya admin otomatis ditambahkan di total bayar.</li>
                <li>Cek rincian lalu <b>Bayar</b> dengan Saldo Akun.</li>
            </ol>
            <div style="margin-top:10px; font-size:12px; color:#e74c3c; background:#ffebee; padding:10px; border-radius:6px;">
                <b><i class="fas fa-triangle-exclamation"></i> Catatan:</b> Pastikan nomor yang dimasukkan sudah benar! Kesalahan nomor bukan tanggung jawab kami.
            </div>
        `,
        confirmButtonText: 'Oke Paham'
    });
});

document.getElementById('btnBuyBebas')?.addEventListener('click', () => {
    if (!selectedBebasProduct || !checkedBebasUser || selectedBebasNominal < 1000 || !selectedMethodBebas) {
        checkOrderBebas();
        return;
    }
    
    document.getElementById('cb-provider').innerText = selectedBebasProduct.name;
    document.getElementById('cb-name').innerText = checkedBebasUser.name || '-';
    document.getElementById('cb-phone').innerText = checkedBebasUser.number || '-';
    document.getElementById('cb-nominal').innerText = 'Rp ' + selectedBebasNominal.toLocaleString();
    document.getElementById('cb-fee').innerText = 'Rp ' + selectedBebasFee.toLocaleString();
    document.getElementById('cb-method').innerText = selectedMethodBebas.toUpperCase();
    
    const finalPrice = getFinalPriceByPage('bebas') || selectedBebasTotal;
    document.getElementById('cb-total').innerText = 'Rp ' + finalPrice.toLocaleString();
    
    fillBuyerInfoForModal('confirmBebasModal');
    document.getElementById('confirmBebasModal').classList.add('show');
});

document.getElementById('btnCloseConfirmBebas')?.addEventListener('click', () => {
    document.getElementById('confirmBebasModal').classList.remove('show');
});

document.getElementById('btnFinalPayBebas')?.addEventListener('click', async () => {
    const { token, user } = checkLogin();
    const btn = document.getElementById('btnFinalPayBebas');
    const originalText = btn.innerText;
    btn.innerText = "Memproses...";
    btn.disabled = true;
    
    const finalPrice = getFinalPriceByPage('bebas') || selectedBebasTotal;
    const promoData = getPromoDataByPage('bebas');
    
    try {
        const res = await fetch('/api/buy-ewallet/bebas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                product_code: selectedBebasProduct.code,
                target: checkedBebasUser.number,
                nominal: selectedBebasNominal,
                method: selectedMethodBebas,
                promo_code: promoData ? promoData.code : null,
                final_amount: finalPrice
            })
        });
        const data = await res.json();
        document.getElementById('confirmBebasModal').classList.remove('show');
        
        if (data.requirePhone) {
            btn.innerText = originalText;
            btn.disabled = false;
            Swal.fire({
                title: 'Lengkapi Nomor WhatsApp',
                text: data.message || 'Silakan lengkapi nomor WhatsApp Anda terlebih dahulu!',
                icon: 'warning',
                confirmButtonText: 'Update Sekarang',
                confirmButtonColor: '#2ecc71'
            }).then(() => {
                switchPage('akun');
            });
            return;
        }
        
        if (data.success) {
            showPurchaseSuccessPage({
                judul: 'TOPUP E-WALLET BERHASIL',
                subjudul: `Topup ${selectedBebasProduct ? selectedBebasProduct.name : 'E-Wallet'} sedang diproses. Saldo masuk dalam beberapa menit.`,
                iconHtml: '<i class="fas fa-credit-card" style="color:var(--primary-color);"></i>',
                labelProduk: 'Layanan',
                valueProduk: selectedBebasProduct ? selectedBebasProduct.name : '-',
                labelNominal: 'Nominal',
                nominal: selectedBebasNominal,
                total: finalPrice,
                cekWarna: '#1e3c72',
                cekIcon: '<i class="fas fa-wallet"></i>',
                cekTeks: 'CEK STATUS TOPUP',
                cekPesananFn: () => switchPage('transaksi')
            });
            resetBebasInputs();
            loadUserData();
        } else {
            Swal.fire('Gagal', data.message, 'error');
            if (data.refund) loadUserData();
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Gagal', 'Terjadi kesalahan', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

// Setup QRIS Statis page events
function setupQRISStatisEvents() {
// Tombol buka QRIS Statis dari home (tombol hijau)
const btnQRIS = document.getElementById('btnBukaQRISStatis');
if (btnQRIS) {
    btnQRIS.onclick = () => {
        if (!checkLogin().token) {
            window.location.href = '/login';
            return;
        }
        // BUKA HALAMAN QRIS STATIS TANPA .html
        window.location.href = '/qrisstatis';
    };
}

    // Back button
    const btnBack = document.getElementById('btnBackQRISStatis');
    if (btnBack) {
        btnBack.onclick = () => switchPage('home');
    }
    
    // Submit deposit button
    const btnSubmit = document.getElementById('btnSubmitQrisDeposit');
    if (btnSubmit) {
        btnSubmit.onclick = submitQRISDeposit;
    }
    
    // Withdraw button
    const btnWithdraw = document.getElementById('btnWithdrawQRIS');
    if (btnWithdraw) {
        btnWithdraw.onclick = () => {
            document.getElementById('withdrawCurrentBalance').innerText = 'Rp ' + currentQRISBalance.toLocaleString('id-ID');
            document.getElementById('withdrawAmount').value = '';
            document.getElementById('withdrawTotal').innerText = 'Rp 0';
            document.getElementById('withdrawQRISModal').classList.add('show');
        };
    }
    
    // Withdraw amount calculator
    const withdrawAmount = document.getElementById('withdrawAmount');
    if (withdrawAmount) {
        withdrawAmount.oninput = () => {
            const val = parseInt(withdrawAmount.value) || 0;
            document.getElementById('withdrawTotal').innerText = 'Rp ' + val.toLocaleString('id-ID');
        };
    }
    
    // Confirm withdraw
    const btnConfirmWithdraw = document.getElementById('btnConfirmWithdraw');
    if (btnConfirmWithdraw) {
        btnConfirmWithdraw.onclick = withdrawQRISStatis;
    }
    
    // Close modal
    const btnCloseWithdraw = document.getElementById('btnCloseWithdrawQRIS');
    if (btnCloseWithdraw) {
        btnCloseWithdraw.onclick = () => document.getElementById('withdrawQRISModal').classList.remove('show');
    }
}

function jalankanAnimasiRekap(targetAngka) {
    const overlay = document.getElementById('animasiRekap');
    const numberEl = document.getElementById('recapNumber');
    if (!overlay || !numberEl) return;
    
    overlay.style.display = 'flex';
    let current = 0;
    
    const interval = setInterval(() => {
        current += Math.ceil(targetAngka / 20); // Kecepatan counter
        if (current >= targetAngka) {
            current = targetAngka;
            clearInterval(interval);
            
            // Hilangkan otomatis setelah 3.5 detik
            setTimeout(() => {
                overlay.style.animation = 'fadeOut 0.5s forwards';
                setTimeout(() => { 
                    overlay.style.display = 'none'; 
                    overlay.style.animation = ''; 
                }, 500);
            }, 3500);
        }
        numberEl.innerText = current;
    }, 40);
}

// ==========================================
// FUNGSI POP-UP VIDEO TUTORIAL
// ==========================================
function bukaVideoTutorial(videoUrl, title) {
    // Sistem otomatis ekstrak ID dari link utuh
    let videoId = videoUrl;
    if (videoUrl.includes('youtube.com/watch?v=')) {
        videoId = videoUrl.split('v=').split('&');
    } else if (videoUrl.includes('youtu.be/')) {
        videoId = videoUrl.split('youtu.be/').split('?');
    }

    const modal = document.getElementById('videoModalOverlay');
    const iframe = document.getElementById('videoIframe');
    const titleEl = document.getElementById('videoModalTitle');
    
    titleEl.innerText = title;
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    modal.classList.add('show');
}

function tutupVideoTutorial() {
    const modal = document.getElementById('videoModalOverlay');
    const iframe = document.getElementById('videoIframe');
    
    modal.classList.remove('show');
    // Hapus link src agar video berhenti dan tidak jalan di background
    iframe.src = "";
}

// --- SISTEM KURS RINGGIT ---
let kursMYR = 0.00028; 
async function fetchKursRinggit() {
    // Dimatikan karena sudah menggunakan kurs pasti TNG
}
// fetchKursRinggit(); 
// -------------------------------------

// ============================================================
// RIWAYAT LOGIN (SESSION MANAGEMENT)
// ============================================================
async function loadLoginSessions() {
    const container = document.getElementById('loginSessionsList');
    if (!container) return;
    const { token } = checkLogin();
    if (!token) return;
    try {
        const res = await fetch('/api/sessions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }), credentials: 'include'
        });
        const data = await res.json();
        if (!data.success) { container.innerHTML = '<div style="text-align:center;padding:15px;color:var(--text-sub);">Gagal memuat sesi.</div>'; return; }
        if (!data.sessions.length) { container.innerHTML = '<div style="text-align:center;padding:15px;color:var(--text-sub);font-size:13px;">Tidak ada sesi aktif.</div>'; return; }
        container.innerHTML = data.sessions.map(s => {
            const isCurrent = s.isCurrent;
            const deviceIcon = s.device === 'Mobile' ? 'fa-mobile-alt' : s.device === 'Tablet' ? 'fa-tablet-alt' : 'fa-desktop';
            const batteryHtml = (s.battery !== null && s.battery !== undefined)
                ? `<span style="color:${s.battery > 30 ? '#2ecc71' : '#e74c3c'};font-size:11px;font-weight:800;"><i class="fas fa-battery-${s.battery > 75 ? 'full' : s.battery > 50 ? 'three-quarters' : s.battery > 25 ? 'half' : 'quarter'}"></i> ${s.battery}%</span>` : '';
            const timeAgo = formatTimeAgo(new Date(s.lastActive));
            const createdAt = new Date(s.createdAt).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'});
            return `<div style="background:var(--bg-card);border-radius:16px;padding:16px;border:${isCurrent?'1.5px solid var(--primary-color)':'1px solid var(--border-color)'};position:relative;">
                ${isCurrent?'<div style="position:absolute;top:10px;right:12px;background:var(--primary-color);color:white;font-size:9px;font-weight:900;padding:3px 8px;border-radius:20px;">SESI INI</div>':''}
                <div style="display:flex;align-items:flex-start;gap:14px;">
                    <div style="width:44px;height:44px;background:${isCurrent?'rgba(33,150,243,0.12)':'rgba(0,0,0,0.04)'};border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas ${deviceIcon}" style="font-size:20px;color:${isCurrent?'var(--primary-color)':'var(--text-sub)'}"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:900;color:var(--text-main);margin-bottom:3px;">${s.deviceName ? s.deviceName : s.device} <span style="font-size:9px;font-weight:900;padding:2px 7px;border-radius:6px;vertical-align:middle;background:${s.platform==='app'?'#e8f5e9':'#e3f2fd'};color:${s.platform==='app'?'#2e7d32':'#1565c0'};">${s.platform==='app'?'APK':'WEB'}</span></div>
                        <div style="font-size:11px;color:var(--text-sub);font-weight:700;margin-bottom:4px;">${s.browser}${s.os ? ' · ' + s.os : ''}</div>
                        <div style="font-size:11px;color:var(--text-sub);font-weight:700;margin-bottom:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            <span><i class="fas fa-map-marker-alt" style="color:#e74c3c;"></i> ${s.ip}</span>
                            ${batteryHtml}
                        </div>
                        <div style="font-size:10px;color:var(--text-sub);"><i class="far fa-clock"></i> Login: ${createdAt} · Aktif: ${timeAgo}</div>
                    </div>
                </div>
                ${!isCurrent?`<div style="border-top:1px solid var(--border-color);margin-top:12px;padding-top:10px;display:flex;justify-content:flex-end;">
                    <button onclick="revokeSingleSession('${s.sessionId}')" style="background:rgba(231,76,60,0.08);color:#e74c3c;border:none;padding:7px 16px;border-radius:10px;font-size:11px;font-weight:900;cursor:pointer;"><i class="fas fa-times"></i> Akhiri Sesi</button>
                </div>`:''}
            </div>`;
        }).join('');
    } catch(e) { container.innerHTML = '<div style="text-align:center;padding:15px;color:var(--text-sub);">Gagal memuat sesi.</div>'; }
}

function formatTimeAgo(date) {
    const diff = Math.floor((Date.now() - date) / 1000);
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return Math.floor(diff/60) + ' menit lalu';
    if (diff < 86400) return Math.floor(diff/3600) + ' jam lalu';
    return Math.floor(diff/86400) + ' hari lalu';
}

async function revokeSingleSession(sessionId) {
    const result = await Swal.fire({
        title: 'Akhiri Sesi?',
        text: 'Perangkat tersebut akan segera dikeluarkan.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-sign-out-alt"></i> Ya, Keluarkan',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: 'var(--bg-body)',
        customClass: { popup: 'swal-rounded', cancelButton: 'swal-cancel-btn' }
    });
    if (!result.isConfirmed) return;
    const { token } = checkLogin();
    try {
        const res = await fetch('/api/sessions/revoke', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, sessionId }), credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            Swal.fire({ icon: 'success', title: 'Sesi Diakhiri', text: 'Perangkat tersebut telah dikeluarkan.', timer: 2000, showConfirmButton: false, toast: true, position: 'top-end', timerProgressBar: true });
            loadLoginSessions();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal', text: data.message || 'Tidak dapat mengakhiri sesi.', timer: 2500, showConfirmButton: false, toast: true, position: 'top-end' });
        }
    } catch(e) {
        Swal.fire({ icon: 'error', title: 'Koneksi Error', text: 'Gagal terhubung ke server.', timer: 2000, showConfirmButton: false, toast: true, position: 'top-end' });
    }
}

async function revokeAllSessions() {
    const result = await Swal.fire({
        title: 'Keluar Semua Perangkat?',
        text: 'Semua sesi lain akan diakhiri. Sesi kamu saat ini tetap aktif.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-sign-out-alt"></i> Ya, Keluar Semua',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#e74c3c',
        customClass: { popup: 'swal-rounded' }
    });
    if (!result.isConfirmed) return;
    const { token } = checkLogin();
    try {
        const res = await fetch('/api/sessions/revoke-all', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }), credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            Swal.fire({ icon: 'success', title: 'Berhasil', text: 'Semua sesi lain telah diakhiri.', timer: 2000, showConfirmButton: false, toast: true, position: 'top-end', timerProgressBar: true });
            loadLoginSessions();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal', text: data.message || 'Tidak dapat mengakhiri sesi.', timer: 2500, showConfirmButton: false, toast: true, position: 'top-end' });
        }
    } catch(e) {
        Swal.fire({ icon: 'error', title: 'Koneksi Error', text: 'Gagal terhubung ke server.', timer: 2000, showConfirmButton: false, toast: true, position: 'top-end' });
    }
}

let _heartbeatInterval = null;
let _sessionKickedShown = false;
async function startSessionHeartbeat() {
    if (_heartbeatInterval) clearInterval(_heartbeatInterval);
    const sendHeartbeat = async () => {
        let battery = null;
        try { if ('getBattery' in navigator) { const bat = await navigator.getBattery(); battery = Math.round(bat.level * 100); } } catch(e) {}
        try {
            const res = await fetch('/api/session-heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ battery }), credentials: 'include' });
            const data = await res.json();
            if (data && data.kicked === true && !_sessionKickedShown) {
                _sessionKickedShown = true;
                clearInterval(_heartbeatInterval);
                await Swal.fire({
                    icon: 'warning',
                    title: 'Sesi Diakhiri',
                    html: '<b>Akun Anda telah dikeluarkan</b> dari perangkat ini oleh pemilik akun.<br><br>Silakan login kembali untuk melanjutkan.',
                    confirmButtonText: '<i class="fas fa-sign-in-alt"></i> Login Kembali',
                    confirmButtonColor: 'var(--primary-color)',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                });
                try { if (window.RikiPush && RikiPush.clearUser) await RikiPush.clearUser(); } catch (e) {}
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        } catch(e) {}
    };
    sendHeartbeat();
    _heartbeatInterval = setInterval(sendHeartbeat, 30 * 1000);
}

// showToast dipertahankan (dipakai fitur lain)
function showToast(message, type = 'success') {
    Swal.fire({
        icon: type,
        title: message,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });
}


// ============================================================
// NOKOS / OTP (nomor virtual) — pilih layanan + negara + operator, pilih produk, terima OTP
// ============================================================
(function () {
    const $ = (id) => document.getElementById(id);
    const MAX_CHIPS = 300;
    const POP_SERVICES = ['whatsapp', 'telegram', 'instagram', 'tiktok', 'facebook', 'google', 'twitter', 'discord', 'openai', 'apple', 'microsoft', 'amazon', 'netflix', 'spotify', 'snapchat', 'tinder', 'paypal', 'uber', 'linkedin'];
    const POP_COUNTRIES = ['indonesia', 'india', 'usa', 'united states', 'united kingdom', 'philippines', 'brazil', 'vietnam', 'malaysia', 'thailand', 'china', 'ukraine'];
    // [kata awal nama layanan, kelas ikon Font Awesome, warna]
    const BRANDS = [
        ['whatsapp', 'fab fa-whatsapp', '#25D366'], ['telegram', 'fab fa-telegram', '#2AABEE'],
        ['instagram', 'fab fa-instagram', '#E1306C'], ['tiktok', 'fab fa-tiktok', '#fe2c55'],
        ['facebook', 'fab fa-facebook', '#1877F2'], ['google', 'fab fa-google', '#4285F4'],
        ['youtube', 'fab fa-youtube', '#FF0000'], ['twitter', 'fab fa-twitter', '#1DA1F2'],
        ['discord', 'fab fa-discord', '#5865F2'], ['openai', 'fas fa-robot', '#10a37f'], ['chatgpt', 'fas fa-robot', '#10a37f'],
        ['apple', 'fab fa-apple', 'var(--text-main)'], ['microsoft', 'fab fa-microsoft', '#00A4EF'],
        ['amazon', 'fab fa-amazon', '#FF9900'], ['netflix', 'fas fa-film', '#E50914'],
        ['spotify', 'fab fa-spotify', '#1DB954'], ['snapchat', 'fab fa-snapchat', '#f7c600'],
        ['tinder', 'fab fa-tinder', '#FE3C72'], ['paypal', 'fab fa-paypal', '#0070BA'],
        ['uber', 'fab fa-uber', 'var(--text-main)'], ['linkedin', 'fab fa-linkedin', '#0A66C2'],
        ['wechat', 'fab fa-weixin', '#07C160'], ['shopee', 'fas fa-bag-shopping', '#EE4D2D'],
        ['line', 'fab fa-line', '#06C755'], ['viber', 'fab fa-viber', '#7360F2'],
        ['signal', 'fas fa-comment', '#3A76F0'], ['grab', 'fas fa-car', '#00B14F']
    ];

    let countries = [], services = [], operators = [];
    let selService = null, selCountry = null, selOpId = 0;   // selOpId 0 = operator "Any"
    let pollT = null, tickT = null;
    let lastStatus = {};      // order_id -> status (deteksi OTP baru masuk)
    let resendWait = {};      // order_id -> kode lama saat menunggu kode baru setelah Kirim Ulang
    let lastCode = {};        // order_id -> kode terakhir (deteksi kode baru)
    let currentOrders = [];
    let busy = false, booted = false;
    let svcReq = 0, opReq = 0, offReq = 0;
    let histData = [], histFilter = 'all';

    function getToken() { try { return checkLogin().token; } catch (e) { return null; } }
    async function api(path, body) {
        try {
            const r = await fetch('/api/nokos/' + path, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: getToken(), ...(body || {}) })
            });
            return await r.json();
        } catch (e) { return { success: false, message: 'Gagal terhubung ke server.' }; }
    }
    const esc = (v) => escapeHtml(v == null ? '' : String(v)); // escapeHtml bawaan error kalau diberi angka
    // SMS dari provider kadang berisi entitas HTML (mis. &#10; = baris baru) -> ubah jadi teks biasa
    const smsText = (t) => String(t == null ? '' : t).replace(/&#0?10;|&#13;/g, '\n').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const fmtDt = (d) => d ? new Date(d).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
    const rp = (n) => 'Rp ' + parseInt(n || 0).toLocaleString('id-ID');
    const nf = (n) => parseInt(n || 0).toLocaleString('id-ID');
    const pageActive = () => { const p = $('page-nokos'); return !!(p && p.classList.contains('active')); };
    const rankOf = (list, name, exact) => {
        const n = String(name || '').toLowerCase();
        const i = exact ? list.indexOf(n) : list.findIndex(k => n.includes(k));
        return i < 0 ? 999 : i;
    };

    function brandIcon(name) {
        const words = String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        for (const [k, cls, col] of BRANDS) {
            if (words.some(w => w.startsWith(k))) return `<i class="${cls}" style="color:${col};"></i>`;
        }
        const ch = (words[0] || '?')[0].toUpperCase();
        return `<span class="nk-ico-letter">${escapeHtml(ch)}</span>`;
    }

    window.nokosBrandIcon = brandIcon; // dipakai halaman Provider 2 (nokos2.js)

    // ---------- chip: layanan ----------
    function renderServiceChips() {
        const box = $('nokosServiceChips'); if (!box) return;
        const q = ($('nokosServiceSearch').value || '').trim().toLowerCase();
        const list = services.filter(s => !q || String(s.name).toLowerCase().includes(q) || String(s.code || '').toLowerCase().includes(q));
        const shown = list.slice(0, MAX_CHIPS);
        $('nokosServiceCount').textContent = services.length ? `(${list.length} dari ${services.length})` : '';
        if (!shown.length) { box.innerHTML = '<div class="nk-empty">Layanan tidak ditemukan.</div>'; return; }
        box.innerHTML = shown.map(s =>
            `<button type="button" class="nk-chip${selService && selService.id === s.id ? ' active' : ''}" data-id="${s.id}">${brandIcon(s.name)}<span>${escapeHtml(s.name)}</span></button>`
        ).join('') + (list.length > shown.length ? `<div class="nk-more">Menampilkan ${shown.length} pertama, ketik untuk mencari yang lain.</div>` : '');
    }

    // ---------- chip: negara ----------
    function renderCountryChips() {
        const box = $('nokosCountryChips'); if (!box) return;
        const q = ($('nokosCountrySearch').value || '').trim().toLowerCase();
        const list = countries.filter(c => !q || String(c.name).toLowerCase().includes(q) || String(c.dial_code || '').includes(q));
        const shown = list.slice(0, MAX_CHIPS);
        $('nokosCountryCount').textContent = countries.length ? `(${list.length} dari ${countries.length})` : '';
        if (!shown.length) { box.innerHTML = '<div class="nk-empty">Negara tidak ditemukan.</div>'; return; }
        box.innerHTML = shown.map(c =>
            `<button type="button" class="nk-chip${selCountry && selCountry.id === c.id ? ' active' : ''}" data-id="${c.id}"><span style="overflow:visible;">${c.emoji || ''}</span><span>${escapeHtml(c.name)}</span></button>`
        ).join('') + (list.length > shown.length ? `<div class="nk-more">Menampilkan ${shown.length} pertama, ketik untuk mencari yang lain.</div>` : '');
    }

    // ---------- chip: operator ----------
    function renderOperatorChips() {
        const box = $('nokosOperatorChips'); if (!box) return;
        $('nokosOperatorCount').textContent = `(${operators.length})`;
        box.innerHTML = operators.map(o => {
            const id = o.operator_id || 0;
            const ico = o.operator_id ? `<span class="nk-ico-letter">${escapeHtml(String(o.name || '?')[0].toUpperCase())}</span>` : '<i class="fas fa-signal" style="color:var(--text-sub);"></i>';
            return `<button type="button" class="nk-chip${id === selOpId ? ' active' : ''}" data-id="${id}">${ico}<span>${escapeHtml(o.name)}</span></button>`;
        }).join('');
    }

    // ---------- muat data ----------
    async function loadCountries() {
        const box = $('nokosCountryChips'); if (!box) return false;
        const d = await api('countries');
        if (!d.success) { box.innerHTML = '<div class="nk-empty" style="color:#e74c3c;">Gagal memuat negara.</div>'; return false; }
        countries = (d.data || []).slice().sort((a, b) => (rankOf(POP_COUNTRIES, a.name, true) - rankOf(POP_COUNTRIES, b.name, true)) || String(a.name).localeCompare(String(b.name)));
        if (!countries.length) {
            box.innerHTML = '';
            $('nokosServiceChips').innerHTML = '';
            $('nokosProductGrid').innerHTML = stockEmptyHtml('Nokos');
            return false;
        }
        renderCountryChips();
        return true;
    }

    // cid kosong = semua layanan; cid ada = hanya layanan yang tersedia di negara itu
    async function loadServices(cid) {
        const my = ++svcReq;
        const box = $('nokosServiceChips'); if (!box) return;
        box.innerHTML = '<div class="nk-empty"><i class="fas fa-spinner fa-spin"></i> Memuat layanan...</div>';
        const d = await api('services', cid ? { country_id: cid } : {});
        if (my !== svcReq) return;
        if (!d.success) { services = []; box.innerHTML = '<div class="nk-empty" style="color:#e74c3c;">Gagal memuat layanan.</div>'; return; }
        services = (d.data || []).slice().sort((a, b) => (rankOf(POP_SERVICES, a.name) - rankOf(POP_SERVICES, b.name)) || String(a.name).localeCompare(String(b.name)));
        if (selService) selService = services.find(s => s.id === selService.id) || null;
        renderServiceChips();
    }

    async function loadOperators() {
        const sec = $('nokosOperatorSection'); if (!sec) return;
        const my = ++opReq;
        selOpId = 0; operators = [];
        if (!selService || !selCountry) { sec.style.display = 'none'; return; }
        const d = await api('operators', { country_id: selCountry.id, platform_id: selService.id });
        if (my !== opReq) return;
        operators = d.success && Array.isArray(d.data) ? d.data : [];
        const real = operators.filter(o => o.operator_id);
        if (!real.length) { operators = []; sec.style.display = 'none'; return; }   // tidak ada pilihan operator
        if (!operators.some(o => !o.operator_id)) selOpId = real[0].operator_id;    // tidak ada "Any" -> pakai operator pertama
        sec.style.display = '';
        renderOperatorChips();
    }

    async function loadOffers() {
        const grid = $('nokosProductGrid'); if (!grid) return;
        const my = ++offReq;
        if (!selService || !selCountry) {
            $('nokosProductCount').textContent = '';
            grid.innerHTML = '<div class="nk-empty">Pilih layanan & negara dulu.</div>';
            return;
        }
        grid.innerHTML = '<div class="nk-empty"><i class="fas fa-spinner fa-spin"></i> Memuat stok...</div>';
        const d = await api('products', { country_id: selCountry.id, platform_id: selService.id, operator_id: selOpId || undefined });
        if (my !== offReq) return;
        if (!d.success) { $('nokosProductCount').textContent = ''; grid.innerHTML = `<div class="nk-empty" style="color:#e74c3c;">${escapeHtml(d.message || 'Gagal memuat stok')}</div>`; return; }
        if (!d.data.length) { $('nokosProductCount').textContent = '(0)'; grid.innerHTML = stockEmptyHtml('Nokos ini'); return; }
        $('nokosProductCount').textContent = `(${d.data.length})`;
        const ico = brandIcon(selService.name), svcName = escapeHtml(selService.name);
        grid.innerHTML = d.data.map(o => `
            <div class="nk-prod" data-pid="${o.product_id}" data-price="${o.price}">
                <div class="nk-prod-top">${ico}<b>${svcName}</b></div>
                <div class="nk-prod-bot"><small>${nf(o.available)} avail</small><span class="nk-prod-price">${rp(o.price)}</span></div>
            </div>`).join('');
    }

    async function onSelectionChange() {
        if (!selService || !selCountry) {
            $('nokosOperatorSection').style.display = 'none';
            loadOffers();
            return;
        }
        $('nokosProductGrid').innerHTML = '<div class="nk-empty"><i class="fas fa-spinner fa-spin"></i> Memuat stok...</div>';
        await loadOperators();
        loadOffers();
    }

    // ---------- beli ----------
    async function buyOffer(el) {
        if (busy) return;
        if (!getToken()) { window.location.href = '/login'; return; }
        if (!selService || !selCountry) return;
        const price = el.dataset.price;
        const op = selOpId ? operators.find(o => o.operator_id === selOpId) : null;
        const label = `${escapeHtml(selService.name)} · ${escapeHtml(selCountry.name)}${op ? ' · ' + escapeHtml(op.name) : ''}`;
        const ok = await Swal.fire({
            title: 'Pesan Nomor?', html: `<div style="font-size:14px;"><b>${label}</b><br>Harga: <b>${rp(price)}</b><br><small style="color:#888;">Saldo dipotong sekarang. Jika OTP tidak masuk, saldo otomatis kembali.</small></div>`,
            icon: 'question', showCancelButton: true, confirmButtonText: 'Ya, Pesan', cancelButtonText: 'Batal', confirmButtonColor: '#2196F3'
        });
        if (!ok.isConfirmed) return;
        busy = true;
        Swal.fire({ title: 'Memesan nomor...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const d = await api('order', {
            product_id: el.dataset.pid,
            country_id: selCountry.id, platform_id: selService.id, operator_id: selOpId || undefined
        });
        busy = false;
        if (d.success) {
            Swal.fire({ icon: 'success', title: 'Nomor didapat!', text: 'Tunggu kode OTP masuk di bawah.', timer: 1800, showConfirmButton: false });
            try { loadUserData(); } catch (e) {}
            await refreshActive();
            const box = $('nokosActiveBox'); if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
            loadOffers();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal', text: d.message || 'Pesanan gagal.' });
        }
    }

    // ---------- order aktif ----------
    function fmtLeft(exp) {
        const ms = new Date(exp).getTime() - Date.now();
        if (!isFinite(ms) || ms <= 0) return '00:00';
        const s = Math.floor(ms / 1000);
        return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }

    function renderActive() {
        const box = $('nokosActiveBox'); if (!box) return;
        if (!currentOrders.length) { box.innerHTML = ''; return; }
        box.innerHTML = currentOrders.map(o => {
            const done = o.status === 'success';
            const otpBlock = done
                ? `<div class="nk-row"><div><div class="nk-label">KODE OTP</div>
                    <div class="nk-val nk-otp">${o.otp_code ? escapeHtml(o.otp_code) : '<span style="font-size:13px; letter-spacing:0; word-break:break-word; white-space:pre-wrap;">' + esc(smsText(o.otp_message || '-')) + '</span>'}</div></div>
                    ${o.otp_code ? `<button class="nk-copy" data-copy="${escapeHtml(o.otp_code)}">Salin</button>` : ''}</div>`
                : `<div class="nk-wait"><i class="fas fa-spinner fa-spin" style="color:var(--primary-color);"></i> Menunggu kode OTP... sisa waktu <b class="nk-timer" data-exp="${escapeHtml(o.expires_at)}">${fmtLeft(o.expires_at)}</b></div>`;
            const waitingNew = done && resendWait[o.order_id] !== undefined && resendWait[o.order_id] === (o.otp_code || '');
            const left = o.resend_available_at ? Math.ceil((new Date(o.resend_available_at).getTime() - Date.now()) / 1000) : 0;
            const canResend = o.can_resend !== false && left <= 0;
            const resendBtn = `<button class="nk-resend" data-resend="${escapeHtml(o.order_id)}" ${canResend ? '' : 'disabled'}><i class="fas fa-rotate-right"></i> ${canResend ? 'Kirim Ulang Kode' : (left > 0 ? 'Kirim ulang (' + left + 'd)' : 'Kirim ulang tidak tersedia')}</button>`;
            const actions = done
                ? `<div class="nk-actions">${resendBtn}<button class="nk-done" data-done="${escapeHtml(o.order_id)}"><i class="fas fa-check"></i> Done</button></div>`
                : `<div class="nk-actions">${resendBtn}</div>`;
            return `
            <div class="nokos-card ${done ? 'done' : ''}">
                <div class="nk-title">${escapeHtml(o.product_name || 'Nokos')}</div>
                <div class="nk-top"><span>${done ? '✅ OTP diterima' : '⏳ Menunggu OTP'}</span><span>#${escapeHtml(o.order_id)}</span></div>
                <div class="nk-row"><div><div class="nk-label">NOMOR</div><div class="nk-val">${escapeHtml(o.phone_number || '-')}</div></div>
                    <button class="nk-copy" data-copy="${escapeHtml(String(o.phone_number || '').replace(/^\+/, ''))}">Salin</button></div>
                ${otpBlock}
                ${waitingNew ? '<div class="nk-wait"><i class="fas fa-spinner fa-spin" style="color:var(--primary-color);"></i> Menunggu kode baru...</div>' : ''}
                ${actions}
                ${done ? '' : `<button class="nk-cancel" data-cancel="${escapeHtml(o.order_id)}" ${o.can_cancel ? '' : 'disabled'}>${o.can_cancel ? 'Batalkan & Refund Saldo' : 'Batal tersedia setelah 2 menit'}</button>`}
            </div>`;
        }).join('');
    }

    async function refreshActive() {
        if (!getToken()) return;
        const d = await api('active');
        if (!d.success) return;
        // deteksi OTP baru masuk
        d.data.forEach(o => {
            if (o.status === 'success' && lastStatus[o.order_id] === 'proses') {
                try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
                if (!window.RM_IS_APP) Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Kode OTP masuk!', showConfirmButton: false, timer: 2500 });
            }
            lastStatus[o.order_id] = o.status;
            const c = o.otp_code || '';
            if (resendWait[o.order_id] !== undefined && c && c !== resendWait[o.order_id]) {
                delete resendWait[o.order_id];
                try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
                if (!window.RM_IS_APP) Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Kode baru masuk!', showConfirmButton: false, timer: 2500 });
            }
            lastCode[o.order_id] = c;
        });
        // order yang hilang dari daftar (expired/batal) -> saldo sudah dikembalikan server
        Object.keys(lastStatus).forEach(id => {
            if (lastStatus[id] === 'proses' && !d.data.find(o => o.order_id === id)) {
                delete lastStatus[id];
                if (!window.RM_IS_APP) Swal.fire({ toast: true, position: 'top', icon: 'info', title: 'Pesanan berakhir tanpa OTP, saldo dikembalikan.', showConfirmButton: false, timer: 3500 });
                try { loadUserData(); } catch (e) {}
            }
        });
        currentOrders = d.data;
        renderActive();
    }

    function tick() {
        document.querySelectorAll('#nokosActiveBox .nk-timer').forEach(el => { el.innerText = fmtLeft(el.dataset.exp); });
    }

    function startPolling() {
        if (!pollT) pollT = setInterval(() => { if (pageActive() && !document.hidden) refreshActive(); }, 4000);
        if (!tickT) tickT = setInterval(() => { if (pageActive()) tick(); }, 1000);
    }

    // ---------- riwayat order ----------
    const HIST_STATUS = {
        proses: ['ACTIVE', 'active'], success: ['COMPLETED', 'done'],
        canceled: ['CANCELED', 'cancel'], expired: ['EXPIRED', 'cancel']
    };
    const histGroup = (st) => st === 'proses' ? 'active' : st === 'success' ? 'completed' : 'canceled';

    function renderHistory() {
        const body = $('nokosHistBody'); if (!body) return;
        const cnt = { all: histData.length, active: 0, completed: 0, canceled: 0 };
        histData.forEach(o => { cnt[histGroup(o.status)]++; });
        $('nkhCountAll').textContent = cnt.all; $('nkhCountActive').textContent = cnt.active;
        $('nkhCountCompleted').textContent = cnt.completed; $('nkhCountCanceled').textContent = cnt.canceled;
        document.querySelectorAll('#nokosHistTabs .nkh-tab').forEach(b => b.classList.toggle('active', b.dataset.f === histFilter));

        const list = histData.filter(o => histFilter === 'all' || histGroup(o.status) === histFilter);
        if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="nkh-empty">Belum ada order.</td></tr>'; return; }
        body.innerHTML = list.map(o => {
            const st = HIST_STATUS[o.status] || [String(o.status || '-').toUpperCase(), 'cancel'];
            const dt = new Date(o.date).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            const otp = o.otp_code ? esc(o.otp_code) : (o.otp_message ? '<span class="nkh-sub">SMS masuk</span>' : '-');
            return `<tr data-oid="${esc(o.order_id)}">
                <td class="nkh-id">#${esc(o.order_id)}</td>
                <td><span class="nkh-svc">${brandIcon(o.service_name)}${esc(o.service_name || '-')}</span></td>
                <td>${o.country_emoji || ''} ${esc(o.country_name || '-')}</td>
                <td class="nkh-mono">${esc(o.phone_number || '-')}</td>
                <td><span class="nkh-badge ${st[1]}">${st[0]}</span></td>
                <td>${rp(o.pay_amount)}</td>
                <td class="nkh-mono">${otp}</td>
                <td class="nkh-sub">${esc(dt)}</td>
            </tr>`;
        }).join('');
    }

    async function loadHistory() {
        const body = $('nokosHistBody'); if (!body) return;
        if (!getToken()) { window.location.href = '/login'; return; }
        if (!histData.length) body.innerHTML = '<tr><td colspan="8" class="nkh-empty"><i class="fas fa-spinner fa-spin"></i> Memuat riwayat...</td></tr>';
        const d = await api('history');
        if (!d.success) { body.innerHTML = `<tr><td colspan="8" class="nkh-empty">${esc(d.message || 'Gagal memuat riwayat.')}</td></tr>`; return; }
        histData = Array.isArray(d.data) ? d.data : [];
        try { renderHistory(); }
        catch (e) {
            console.error('[NOKOS] render riwayat gagal:', e);
            body.innerHTML = '<tr><td colspan="8" class="nkh-empty">Gagal menampilkan riwayat. Coba muat ulang halaman.</td></tr>';
        }
    }

    // ---------- detail order ----------
    function renderDetail(o) {
        const box = $('nokosDetailBody'); if (!box) return;
        const st = HIST_STATUS[o.status] || [String(o.status || '-').toUpperCase(), 'cancel'];
        const phone = String(o.phone_number || '').replace(/^\+/, '');
        const sms = smsText(o.otp_message);
        const copyBtn = (v) => `<button type="button" class="nkd-copy" data-copy="${esc(v)}" title="Salin"><i class="far fa-copy"></i></button>`;

        let otpBlock;
        if (o.otp_code) otpBlock = `<div class="nkd-big otp">${esc(o.otp_code)} ${copyBtn(o.otp_code)}</div>`;
        else if (o.status === 'proses') otpBlock = '<div class="nkd-big wait"><i class="fas fa-spinner fa-spin"></i> Menunggu kode OTP... (kelola di halaman Nokos)</div>';
        else if (sms) otpBlock = '<div class="nkd-big wait">Tidak ada kode, lihat isi SMS di bawah</div>';
        else otpBlock = '<div class="nkd-big wait">-</div>';

        const smsBlock = sms ? `<div class="nkd-sms"><div class="nkd-label">Latest SMS</div><pre>${esc(sms)}</pre></div>` : '';
        const msgCard = (sms || o.otp_code)
            ? `<div class="nkd-msg">
                    <div class="t">${esc(fmtDt(o.otp_at || o.date))}</div>
                    <pre>${esc(sms || ('Kode OTP: ' + o.otp_code))}</pre>
                    ${o.otp_code ? `<div class="o">OTP: <b>${esc(o.otp_code)}</b> ${copyBtn(o.otp_code)}</div>` : ''}
               </div>`
            : '<div class="nk-empty">Belum ada pesan masuk.</div>';

        box.innerHTML = `
            <div class="nkd-title"><h2>Order <span>#${esc(o.order_id)}</span></h2><span class="nkh-badge ${st[1]}">${st[0]}</span></div>
            <div class="nkd-card">
                <div class="nkd-head"><span class="nkh-svc">${brandIcon(o.service_name)}<b>${esc(o.service_name || '-')}</b></span><span>${o.country_emoji || ''} ${esc(o.country_name || '-')}</span></div>
                <div class="nkd-label">Phone Number</div>
                <div class="nkd-big">${esc(phone || '-')} ${phone ? copyBtn(phone) : ''}</div>
                <div class="nkd-label">Last Detected OTP</div>
                ${otpBlock}
                ${smsBlock}
            </div>
            <div class="nkd-card">
                <div class="nkd-grid">
                    <div><div class="nkd-label">Service</div><div class="v">${esc(o.service_name || '-')}</div></div>
                    <div><div class="nkd-label">Country</div><div class="v">${o.country_emoji || ''} ${esc(o.country_name || '-')}</div></div>
                    <div><div class="nkd-label">Price</div><div class="v price">${rp(o.pay_amount)}</div></div>
                    <div><div class="nkd-label">Created</div><div class="v">${esc(fmtDt(o.date))}</div></div>
                    <div><div class="nkd-label">Expires</div><div class="v">${esc(fmtDt(o.expires_at))}</div></div>
                    <div><div class="nkd-label">Completed</div><div class="v">${o.status === 'success' ? esc(fmtDt(o.otp_at)) : '-'}</div></div>
                </div>
            </div>
            <div class="nkd-card">
                <div class="nkd-msg-head"><i class="far fa-message"></i> Messages <small>${(sms || o.otp_code) ? 1 : 0}</small></div>
                ${msgCard}
            </div>
            ${o.status === 'success' && o.local_id && o.provider !== 'p2' ? `<button type="button" class="nk-reuse" data-reuse="${esc(o.local_id)}"><i class="fas fa-rotate"></i> Pakai Nomor Ini Lagi</button>` : ''}`;
    }

    function openDetail(oid) {
        const o = histData.find(x => String(x.order_id) === String(oid));
        if (!o) return;
        renderDetail(o);
        switchPage('nokos-detail');
    }

    async function copyText(txt) {
        try { await navigator.clipboard.writeText(txt); return true; }
        catch (e) {
            try {
                const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
            } catch (e2) { return false; }
        }
    }

    window.initNokosHistory = function () { loadHistory(); };

    window.initNokosPage = async function () {
        startPolling();
        if (!booted) {
            booted = true;
            const ok = await loadCountries();
            if (!ok) { booted = false; refreshActive(); return; }
            // pilihan awal: Indonesia + WhatsApp (kalau ada)
            selCountry = countries.find(c => /^indonesia$/i.test(c.name)) || null;
            renderCountryChips();
            await loadServices(selCountry ? selCountry.id : 0);
            selService = services.find(s => String(s.code || '').toLowerCase() === 'wa' || /^whatsapp$/i.test(s.name)) || null;
            renderServiceChips();
            onSelectionChange();
        }
        refreshActive();
    };

    // ---------- event ----------
    $('btnGoNokos')?.addEventListener('click', () => {
        if (!getToken()) window.location.href = '/login';
        else switchPage('nokos-provider');   // pilih Provider 1 / Provider 2 dulu
    });
    $('btnBackNokos')?.addEventListener('click', () => switchPage('nokos-provider'));
    $('btnNokosHistory')?.addEventListener('click', () => switchPage('nokos-history'));
    $('btnBackNokosHistory')?.addEventListener('click', () => switchPage('nokos-provider'));
    $('btnBackNokosDetail')?.addEventListener('click', () => switchPage('nokos-history'));
    $('nokosHistBody')?.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-oid]'); if (tr) openDetail(tr.dataset.oid);
    });
    $('nokosDetailBody')?.addEventListener('click', async (e) => {
        const ru = e.target.closest('[data-reuse]');
        if (ru && !ru.disabled) {
            ru.disabled = true;
            const op = await api('reactivate-options', { order_id: ru.dataset.reuse });
            if (!op.success) { ru.disabled = false; Swal.fire({ icon: 'info', title: 'Tidak tersedia', text: op.message }); return; }
            const ok = await Swal.fire({ title: 'Pakai nomor ini lagi?', html: `<div style="font-size:14px;"><b>${esc(op.phone_number || '')}</b><br>Harga: <b>${rp(op.price)}</b><br><small style="color:#888;">Nomor yang sama, untuk menerima kode baru. Jika OTP tidak masuk, saldo kembali.</small></div>`, icon: 'question', showCancelButton: true, confirmButtonText: 'Ya, Pesan', cancelButtonText: 'Batal', confirmButtonColor: '#2196F3' });
            if (!ok.isConfirmed) { ru.disabled = false; return; }
            Swal.fire({ title: 'Memesan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const d = await api('reactivate', { order_id: ru.dataset.reuse });
            ru.disabled = false;
            if (d.success) {
                Swal.fire({ icon: 'success', title: 'Berhasil!', text: 'Tunggu kode OTP di halaman Nokos.', timer: 1800, showConfirmButton: false });
                try { loadUserData(); } catch (e2) {}
                switchPage('nokos');
            } else Swal.fire({ icon: 'error', title: 'Gagal', text: d.message });
            return;
        }
        const b = e.target.closest('[data-copy]'); if (!b) return;
        const ok = await copyText(b.dataset.copy);
        const old = b.innerHTML;
        b.innerHTML = ok ? '<i class="fas fa-check" style="color:#1abc9c;"></i>' : '<i class="fas fa-xmark" style="color:#e74c3c;"></i>';
        setTimeout(() => { b.innerHTML = old; }, 1200);
    });
    $('nokosHistTabs')?.addEventListener('click', (e) => {
        const b = e.target.closest('.nkh-tab'); if (!b) return;
        histFilter = b.dataset.f; renderHistory();
    });

    $('nokosServiceSearch')?.addEventListener('input', renderServiceChips);
    $('nokosCountrySearch')?.addEventListener('input', renderCountryChips);

    $('nokosServiceChips')?.addEventListener('click', (e) => {
        const el = e.target.closest('.nk-chip'); if (!el) return;
        const s = services.find(x => String(x.id) === el.dataset.id); if (!s) return;
        selService = s;
        el.parentNode.querySelectorAll('.nk-chip.active').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        onSelectionChange();
    });
    $('nokosCountryChips')?.addEventListener('click', async (e) => {
        const el = e.target.closest('.nk-chip'); if (!el) return;
        const c = countries.find(x => String(x.id) === el.dataset.id); if (!c) return;
        selCountry = c;
        el.parentNode.querySelectorAll('.nk-chip.active').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        await loadServices(c.id);   // layanan difilter sesuai negara
        onSelectionChange();
    });
    $('nokosOperatorChips')?.addEventListener('click', (e) => {
        const el = e.target.closest('.nk-chip'); if (!el) return;
        selOpId = parseInt(el.dataset.id) || 0;
        el.parentNode.querySelectorAll('.nk-chip.active').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        loadOffers();
    });
    $('nokosProductGrid')?.addEventListener('click', (e) => { const el = e.target.closest('.nk-prod'); if (el) buyOffer(el); });

    $('nokosActiveBox')?.addEventListener('click', async (e) => {
        const c = e.target.closest('[data-copy]');
        if (c) {
            try { await navigator.clipboard.writeText(c.dataset.copy); c.innerText = 'Tersalin ✓'; setTimeout(() => { c.innerText = 'Salin'; }, 1500); } catch (_) {}
            return;
        }
        const dn = e.target.closest('[data-done]');
        if (dn && !dn.disabled) {
            const ok = await Swal.fire({ title: 'Selesai memakai OTP?', text: 'Order akan hilang dari sini dan tetap tersimpan di Riwayat.', icon: 'question', showCancelButton: true, confirmButtonText: 'Ya, Done', cancelButtonText: 'Belum', confirmButtonColor: '#2ecc71' });
            if (!ok.isConfirmed) return;
            dn.disabled = true;
            const d = await api('done', { order_id: dn.dataset.done });
            if (d.success) { delete resendWait[dn.dataset.done]; Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Selesai ✓', showConfirmButton: false, timer: 1800 }); }
            else Swal.fire({ icon: 'info', title: 'Info', text: d.message });
            refreshActive();
            return;
        }
        const rs = e.target.closest('[data-resend]');
        if (rs && !rs.disabled) {
            rs.disabled = true;
            const cur = currentOrders.find(o => o.order_id === rs.dataset.resend);
            const d = await api('resend', { order_id: rs.dataset.resend });
            if (d.success) {
                resendWait[rs.dataset.resend] = (cur && cur.otp_code) || '';
                Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Permintaan kirim ulang terkirim', showConfirmButton: false, timer: 2200 });
            } else {
                Swal.fire({ icon: 'info', title: 'Kirim ulang', text: d.message });
            }
            refreshActive();
            return;
        }
        const x = e.target.closest('[data-cancel]');
        if (x && !x.disabled) {
            const ok = await Swal.fire({ title: 'Batalkan pesanan?', text: 'Saldo akan dikembalikan.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Batalkan', cancelButtonText: 'Tidak', confirmButtonColor: '#e74c3c' });
            if (!ok.isConfirmed) return;
            x.disabled = true;
            const d = await api('cancel', { order_id: x.dataset.cancel });
            Swal.fire({ icon: d.success ? 'success' : 'info', title: d.success ? 'Dibatalkan' : 'Info', text: d.message, timer: d.success ? 1800 : undefined, showConfirmButton: !d.success });
            try { loadUserData(); } catch (e2) {}
            refreshActive();
        }
    });
})();


// ==========================================================
// PROFIL: STATUS QRIS STATIS + TOMBOL NOTIFIKASI DENGAN DEBUG
// ==========================================================
function currentUsernameSafe() {
    try { const u = JSON.parse(localStorage.getItem('user') || 'null'); return (u && u.username) || ''; } catch (e) { return ''; }
}

function applyQrisStatisUI(active) {
    const btnHome = document.getElementById('btnBukaQRISStatis');
    if (btnHome) btnHome.style.display = active ? 'flex' : 'none';

    const desc = document.getElementById('profQrisDesc');
    const btn = document.getElementById('btnProfQris');
    if (desc && btn) {
        if (active) {
            desc.innerHTML = '<span style="color:#2ecc71;font-weight:700;">Aktif</span> - Telegram sudah tersambung';
            btn.innerText = 'Buka';
        } else {
            desc.innerText = 'Belum aktif. Sambungkan Telegram untuk mengaktifkan';
            btn.innerText = 'Aktifkan';
        }
    }
}

async function refreshQrisStatis() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const cacheKey = 'qris_active_' + currentUsernameSafe();
    try { applyQrisStatisUI(localStorage.getItem(cacheKey) === '1'); } catch (e) {}
    try {
        const res = await fetch('/api/qris-statis/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        const active = !!(data.success && data.data && data.data.is_active);
        try { localStorage.setItem(cacheKey, active ? '1' : '0'); } catch (e) {}
        applyQrisStatisUI(active);
    } catch (e) { /* biarkan tampilan dari cache */ }
}

document.addEventListener('DOMContentLoaded', refreshQrisStatis);
window.addEventListener('pageshow', refreshQrisStatis);
document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refreshQrisStatis();
});

// ---------- Debug notifikasi ----------
function pushDbgLog(msg, type) {
    const box = document.getElementById('pushDbgBox');
    if (!box) return;
    const colors = { ok: '#3fb950', err: '#f85149', warn: '#d29922', info: '#c9d1d9' };
    const t = new Date().toLocaleTimeString('id-ID', { hour12: false });
    const row = document.createElement('div');
    row.style.color = colors[type || 'info'] || colors.info;
    row.textContent = '[' + t + '] ' + msg;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
}

function pushDbgClear() {
    const box = document.getElementById('pushDbgBox');
    if (box) box.innerHTML = '';
}

function pushDbgCopy() {
    const box = document.getElementById('pushDbgBox');
    if (!box) return;
    const text = box.innerText;
    const done = function () { pushDbgLog('Log disalin ke clipboard.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { pushDbgLog('Gagal menyalin, tahan lalu pilih teks secara manual.', 'warn'); });
    } else {
        pushDbgLog('Clipboard tidak didukung browser ini.', 'warn');
    }
}

function setPushStatusUI(state) {
    const desc = document.getElementById('profPushDesc');
    const btn = document.getElementById('btnProfPush');
    if (!desc || !btn) return;
    if (state === 'on') {
        desc.innerHTML = '<span style="color:#2ecc71;font-weight:700;">Aktif</span> - perangkat ini terdaftar';
        btn.innerText = 'Aktif';
        btn.style.background = '#2ecc71';
    } else if (state === 'denied') {
        desc.innerHTML = '<span style="color:#e74c3c;font-weight:700;">Diblokir</span> - izinkan lewat pengaturan browser';
        btn.innerText = 'Coba Lagi';
        btn.style.background = '#e74c3c';
    } else {
        desc.innerText = 'Belum aktif di perangkat ini';
        btn.innerText = 'Nyalakan';
        btn.style.background = '#1a73e8';
    }
}

// Tunggu OneSignal benar-benar selesai init, maksimal 15 detik
function pushDbgWithOneSignal(cb) {
    let finished = false;
    const timer = setTimeout(function () {
        if (finished) return;
        finished = true;
        pushDbgLog('OneSignal tidak merespons dalam 15 detik. Kemungkinan terblokir adblock/DNS, atau jaringan lambat.', 'err');
    }, 15000);
    const ready = window.RikiOSReady || new Promise(function (resolve) {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(function (OS) { resolve(OS); });
    });
    ready.then(async function (OS) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (window.RikiOSInitError) {
            pushDbgLog('OneSignal gagal init: ' + (window.RikiOSInitError.message || window.RikiOSInitError) + '. Pastikan Site URL di dashboard OneSignal = ' + location.origin, 'err');
            return;
        }
        try { await cb(OS); } catch (e) { pushDbgLog('Error: ' + (e && e.message ? e.message : e), 'err'); }
    });
}

async function pushDbgReport(OS, label) {
    const native = OS.Notifications.permissionNative;
    const sub = OS.User.PushSubscription;
    pushDbgLog(label + ' izin browser: ' + native, native === 'granted' ? 'ok' : (native === 'denied' ? 'err' : 'warn'));
    pushDbgLog(label + ' terdaftar (optedIn): ' + (sub.optedIn ? 'ya' : 'tidak'), sub.optedIn ? 'ok' : 'warn');
    pushDbgLog(label + ' subscription id: ' + (sub.id || '(belum ada)'), sub.id ? 'ok' : 'warn');
    try {
        if (OS.User.getTags) {
            const tags = await OS.User.getTags();
            const tagUser = tags && tags.username;
            pushDbgLog(label + ' tag username: ' + (tagUser || '(belum ada)'), tagUser ? 'ok' : 'warn');
        }
    } catch (e) {}
    const ok = native === 'granted' && sub.optedIn && !!sub.id;
    setPushStatusUI(ok ? 'on' : (native === 'denied' ? 'denied' : 'off'));
    return ok;
}

function pushDbgEnvironment() {
    pushDbgLog('Alamat: ' + location.origin, 'info');
    pushDbgLog('Koneksi aman (HTTPS): ' + (window.isSecureContext ? 'ya' : 'TIDAK'), window.isSecureContext ? 'ok' : 'err');
    pushDbgLog('Notification API: ' + ('Notification' in window ? 'didukung' : 'TIDAK didukung'), 'Notification' in window ? 'ok' : 'err');
    pushDbgLog('Service Worker: ' + ('serviceWorker' in navigator ? 'didukung' : 'TIDAK didukung'), 'serviceWorker' in navigator ? 'ok' : 'err');
    if ('Notification' in window) pushDbgLog('Izin saat ini: ' + Notification.permission, Notification.permission === 'denied' ? 'err' : 'info');
}

async function pushDbgCheck() {
    pushDbgLog('--- Cek status ---', 'info');
    pushDbgEnvironment();
    if ('serviceWorker' in navigator) {
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            if (!regs.length) pushDbgLog('Service worker: belum ada yang terdaftar', 'warn');
            regs.forEach(function (r) {
                const w = r.active || r.waiting || r.installing;
                pushDbgLog('Service worker: ' + (w ? w.state : '?') + ' (' + (w ? new URL(w.scriptURL).pathname : '-') + ')', w && w.state === 'activated' ? 'ok' : 'warn');
            });
        } catch (e) { pushDbgLog('Gagal membaca service worker: ' + e.message, 'err'); }
    }
    pushDbgWithOneSignal(async function (OS) {
        pushDbgLog('OneSignal SDK: termuat', 'ok');
        await pushDbgReport(OS, 'Status:');
    });
}

async function pushDbgEnable() {
    pushDbgLog('--- Menyalakan notifikasi ---', 'info');
    pushDbgEnvironment();

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        pushDbgLog('Browser ini tidak mendukung notifikasi web. Coba pakai Chrome terbaru.', 'err');
        return;
    }
    if (!window.isSecureContext) {
        pushDbgLog('Halaman harus dibuka lewat HTTPS.', 'err');
        return;
    }
    if (Notification.permission === 'denied') {
        pushDbgLog('Izin notifikasi DIBLOKIR di browser. Buka ikon gembok di sebelah alamat situs > Izin/Pengaturan situs > Notifikasi > Izinkan, lalu muat ulang halaman.', 'err');
        setPushStatusUI('denied');
        return;
    }

    // Minta izin langsung dari klik (sebelum menunggu OneSignal) supaya pop-up izin tidak diblokir browser
    if (Notification.permission === 'default') {
        pushDbgLog('Meminta izin notifikasi... (cek pop-up izin di bagian atas browser)', 'info');
        try { await Notification.requestPermission(); } catch (e) { pushDbgLog('requestPermission error: ' + e.message, 'err'); }
        if (Notification.permission === 'denied') {
            pushDbgLog('Izin ditolak. Izinkan lewat pengaturan situs di browser lalu coba lagi.', 'err');
            setPushStatusUI('denied');
            return;
        }
    }

    pushDbgWithOneSignal(async function (OS) {
        pushDbgLog('OneSignal SDK: termuat', 'ok');

        // 1) Minta izin DULU (harus langsung dari klik user, kalau ditunda browser tidak memunculkan pop-up)
        pushDbgLog('Meminta izin notifikasi... (cek pop-up izin di bagian atas browser)', 'info');
        try { await OS.Notifications.requestPermission(); } catch (e) { pushDbgLog('requestPermission error: ' + e.message, 'err'); }

        // 2) Daftarkan perangkat
        if (OS.Notifications.permissionNative === 'granted' && !OS.User.PushSubscription.optedIn) {
            pushDbgLog('Izin diberikan, mendaftarkan perangkat...', 'info');
            try { await OS.User.PushSubscription.optIn(); } catch (e) { pushDbgLog('optIn error: ' + e.message, 'err'); }
        }

        // 3) Hubungkan ke akun (setelah init selesai, jadi tidak error lagi)
        const username = currentUsernameSafe();
        if (username) {
            try {
                await OS.login(username);
                OS.User.addTag('username', username);
                pushDbgLog('Akun dihubungkan: ' + username, 'ok');
            } catch (e) { pushDbgLog('Gagal menghubungkan akun: ' + e.message, 'err'); }
        } else {
            pushDbgLog('Belum login, notifikasi tidak bisa dikaitkan ke akun.', 'warn');
        }

        // Beri waktu OneSignal membuat subscription id
        for (let i = 0; i < 8 && !OS.User.PushSubscription.id; i++) {
            await new Promise(function (r) { setTimeout(r, 750); });
        }

        const ok = await pushDbgReport(OS, 'Hasil:');
        if (ok) {
            pushDbgLog('BERHASIL: notifikasi aktif di perangkat ini.', 'ok');
            const banner = document.getElementById('bannerPushNotif');
            if (banner) banner.style.display = 'none';
        } else if (OS.Notifications.permissionNative === 'denied') {
            pushDbgLog('GAGAL: izin ditolak. Izinkan lewat pengaturan situs di browser lalu coba lagi.', 'err');
        } else if (OS.Notifications.permissionNative === 'default') {
            pushDbgLog('GAGAL: pop-up izin tidak dijawab / tidak muncul. Coba tekan Nyalakan lagi, atau buka situs langsung di Chrome (bukan dalam aplikasi lain).', 'err');
        } else {
            pushDbgLog('GAGAL: izin ada tapi perangkat belum terdaftar. Muat ulang halaman lalu tekan Cek Status.', 'err');
        }
    });
}

// Isi status awal saat halaman profil dibuka
document.addEventListener('DOMContentLoaded', function () {
    if (!('Notification' in window)) { setPushStatusUI('off'); return; }
    if (Notification.permission === 'denied') setPushStatusUI('denied');
    else if (Notification.permission === 'granted') {
        (window.RikiOSReady || Promise.resolve(null)).then(function (OS) {
            if (!OS || !OS.User) return;
            setPushStatusUI(OS.User.PushSubscription.optedIn && OS.User.PushSubscription.id ? 'on' : 'off');
        });
    } else setPushStatusUI('off');
});

// Cek banner notifikasi saat halaman siap & saat tab kembali aktif (misal setelah user mengubah izin di pengaturan)
document.addEventListener('DOMContentLoaded', function () { setTimeout(cekStatusPushNotif, 1500); });
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') cekStatusPushNotif(); });


// ============================================================
// TOAST BERTUMPUK (notif baru MENAMBAH di layar, tidak menimpa yang lama)
// ============================================================
function rmEnsureToastStack() {
    let box = document.getElementById('rmToastStack');
    if (!box) {
        box = document.createElement('div');
        box.id = 'rmToastStack';
        box.style.cssText = 'position:fixed;top:calc(10px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:min(94%,400px);z-index:2147483000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(box);
    }
    return box;
}
function rmEsc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// ===== SUARA NOTIFIKASI (file: /audio/notif.mp3) =====
// Browser baru mau memutar suara setelah ada sentuhan/klik pertama, jadi "dibuka kuncinya" dari interaksi pertama user.
const rmNotifAudio = (function () { try { const a = new Audio('/audio/notif.mp3'); a.preload = 'auto'; return a; } catch (e) { return null; } })();
let rmAudioUnlocked = false, rmLastSoundAt = 0;
function rmUnlockAudio() {
    if (rmAudioUnlocked || !rmNotifAudio) return;
    try {
        rmNotifAudio.muted = true;
        const p = rmNotifAudio.play();
        const fin = (ok) => { try { rmNotifAudio.pause(); rmNotifAudio.currentTime = 0; } catch (e) {} rmNotifAudio.muted = false; if (ok) rmAudioUnlocked = true; };
        if (p && p.then) p.then(() => fin(true)).catch(() => fin(false)); else fin(true);
    } catch (e) {}
}
['pointerdown', 'touchstart', 'keydown', 'click'].forEach(ev => document.addEventListener(ev, rmUnlockAudio, { passive: true }));
function rmPlayNotifSound() {
    try {
        if (!rmNotifAudio || Date.now() - rmLastSoundAt < 3500) return; // jangan dobel kalau push + toast datang bersamaan
        rmLastSoundAt = Date.now();
        rmNotifAudio.currentTime = 0;
        const p = rmNotifAudio.play(); if (p && p.catch) p.catch(() => {});
    } catch (e) {}
}
window.rmPlayNotifSound = rmPlayNotifSound;
// Service worker memberi tahu halaman setiap ada push masuk -> mainkan suara kustom (kalau situs sedang terbuka)
try {
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'rm-push') rmPlayNotifSound(); });
} catch (e) {}

function rmShowStackToast(opt) {
    try {
        if (opt && opt.sound) rmPlayNotifSound();
        const box = rmEnsureToastStack();
        // maksimal 1 toast biasa + 1 toast OTP sekaligus: toast baru MENGGANTIKAN yang lama (tidak menumpuk ke bawah)
        const cat = opt.icon === 'otp' ? 'otp' : 'std';
        Array.from(box.children).forEach(c => { if (c.dataset.cat === cat) c.remove(); });
        const dark = document.body.classList.contains('dark-mode');
        const colors = { success: '#2ecc71', info: '#3498db', otp: '#f39c12', warn: '#e67e22' };
        const color = colors[opt.icon] || colors.success;
        const el = document.createElement('div');
        el.dataset.cat = cat;
        el.style.cssText = 'pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;background:' + (dark ? '#1f2430' : '#fff') + ';color:' + (dark ? '#f1f1f1' : '#222') +
            ';border-radius:14px;padding:11px 14px;border:1px solid rgba(0,0,0,.08);border-left:5px solid ' + color +
            ';font-size:12px;line-height:1.45;opacity:0;transform:translateY(-14px);transition:all .3s ease;cursor:pointer;';
        let inner = '';
        if (opt.title) inner += '<div style="font-weight:800;font-size:13px;margin-bottom:2px;">' + rmEsc(opt.title) + '</div>';
        inner += '<div>' + (opt.html != null ? opt.html : rmEsc(opt.message || '')) + '</div>';
        if (opt.code) {
            inner += '<div style="display:flex;align-items:center;gap:10px;margin-top:8px;">' +
                '<span style="flex:1;font-family:monospace;font-size:22px;font-weight:900;letter-spacing:4px;color:' + color + ';">' + rmEsc(opt.code) + '</span>' +
                '<button type="button" data-copy style="border:none;background:' + color + ';color:#fff;font-weight:800;font-size:11px;padding:7px 12px;border-radius:9px;cursor:pointer;">Salin</button></div>';
        }
        el.innerHTML = inner;
        let timer = null;
        const close = () => { clearTimeout(timer); el.style.opacity = '0'; el.style.transform = 'translateY(-14px)'; setTimeout(() => el.remove(), 300); };
        const arm = () => { clearTimeout(timer); timer = setTimeout(close, opt.duration || 5000); };
        // --- geser kiri / kanan / ke atas = langsung hilang; ketuk = hilang; lepas sebelum jauh = balik lagi ---
        let sx = 0, sy = 0, dx = 0, dy = 0, drag = false, moved = false;
        const fling = (tx, ty) => {
            clearTimeout(timer);
            el.style.transition = 'transform .22s ease, opacity .22s ease';
            el.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 230);
        };
        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest && e.target.closest('[data-copy]')) return;
            drag = true; moved = false; sx = e.clientX; sy = e.clientY; dx = 0; dy = 0;
            clearTimeout(timer);
            el.style.transition = 'none';
            try { el.setPointerCapture(e.pointerId); } catch (er) {}
        });
        el.addEventListener('pointermove', (e) => {
            if (!drag) return;
            dx = e.clientX - sx;
            dy = Math.min(0, e.clientY - sy); // ke bawah tidak bisa, kiri/kanan/atas bisa
            if (Math.abs(dx) > 6 || dy < -6) moved = true;
            el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            el.style.opacity = String(Math.max(0.2, 1 - Math.max(Math.abs(dx) / 220, -dy / 110)));
        });
        const endDrag = () => {
            if (!drag) return;
            drag = false;
            if (Math.abs(dx) > 70) return fling(dx > 0 ? 500 : -500, dy);
            if (dy < -40) return fling(dx, -220);
            el.style.transition = 'transform .2s ease, opacity .2s ease';
            el.style.transform = 'translate(0px,0px)';
            el.style.opacity = '1';
            arm();
        };
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);
        el.addEventListener('click', (e) => {
            if (moved) { moved = false; return; } // habis digeser: jangan dianggap ketukan
            const btn = e.target.closest && e.target.closest('[data-copy]');
            if (btn && opt.code) {
                try { navigator.clipboard.writeText(String(opt.code)); } catch (er) {}
                btn.textContent = 'Tersalin ✓';
                arm();
                return;
            }
            close();
        });
        box.appendChild(el);
        requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
        arm();
    } catch (e) { console.log('toast gagal', e); }
}

// ============================================================
// NOTIF PRIBADI DARI SERVER (transfer, OTP Nokos, order, dll)
// ============================================================
let rmNotifBusy = false;
async function pollMyNotifs() {
    if (rmNotifBusy || document.hidden) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    rmNotifBusy = true;
    try {
        const lastSeen = localStorage.getItem('rm_last_notif') || '';
        const res = await fetch('/api/my-notifs', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, lastSeen }), credentials: 'include'
        });
        const data = await res.json();
        if (!data || !data.success) return;
        const list = data.notifs || [];
        if (!lastSeen && list.length > 3) list.splice(0, list.length - 3); // login baru: jangan banjiri layar
        if (list.length) {
            localStorage.setItem('rm_last_notif', list[list.length - 1].id);
            let needRefresh = false;
            list.forEach((n, i) => {
                setTimeout(() => {
                    const isOtp = n.kind === 'otp' && n.code;
                    // Sama seperti web: toast hanya untuk OTP, THR, dan info sesi (APK sekarang ikut tampil + bunyi).
                    // Notif lain (deposit/order/transfer) di APK cukup bunyi, tanpa toast.
                    if (!isOtp && n.kind !== 'thr' && n.kind !== 'session' && n.kind !== 'transfer') { if (window.RM_IS_APP) rmPlayNotifSound(); return; }
                    rmShowStackToast({
                        title: n.title, message: n.message, code: isOtp ? n.code : '',
                        icon: isOtp ? 'otp' : (n.kind === 'session' ? 'warn' : 'success'),
                        sound: true,
                        duration: isOtp ? 30000 : 6000
                    });
                }, i * 400);
                if (n.kind === 'transfer' || n.kind === 'transfer_out' || n.kind === 'thr' || /Saldo|Deposit|Dibatalkan|Kedaluwarsa/i.test(n.title || '')) needRefresh = true;
            });
            if (needRefresh) {
                try { if (typeof loadUserData === 'function') loadUserData(); } catch (e) {}
                try { if (typeof loadStats === 'function') loadStats(); } catch (e) {}
            }
        } else if (!lastSeen) {
            localStorage.setItem('rm_last_notif', '000000000000000000000000');
        }
    } catch (e) {
    } finally { rmNotifBusy = false; }
}
let rmPubBusy = false;
async function pollPublicTransfer() {
    if (rmPubBusy || document.hidden) return;
    let me = '';
    try { me = String((JSON.parse(localStorage.getItem('user') || 'null') || {}).username || '').toLowerCase(); } catch (e) {}
    if (!me) return;
    rmPubBusy = true;
    try {
        const res = await fetch('/api/public/last-transfer', { cache: 'no-store' });
        const data = await res.json();
        if (!data || !data.success) return;
        const list = data.data || [];
        const newest = list.length ? list[list.length - 1].id : '';
        const last = localStorage.getItem('rm_last_pubtf') || '';
        if (!last) { localStorage.setItem('rm_last_pubtf', newest || '000000000000000000000000'); return; } // pertama kali: jangan tampilkan yang lama
        if (newest && newest > last) localStorage.setItem('rm_last_pubtf', newest);
        list.filter(t => t.id > last && String(t.sender).toLowerCase() !== me && String(t.recipient).toLowerCase() !== me)
            .forEach((t, i) => setTimeout(() => rmShowStackToast({
                title: 'Transfer Berhasil',
                message: t.sender_name + ' berhasil transfer ke ' + t.recipient_name + ' Rp ' + Number(t.amount).toLocaleString('id-ID'),
                icon: 'info', sound: false, duration: 5000
            }), i * 400));
    } catch (e) {} finally { rmPubBusy = false; }
}
(function startNotifPolling() {
    setInterval(pollPublicTransfer, 6000);
    setTimeout(pollPublicTransfer, 2500);
    setInterval(pollMyNotifs, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollMyNotifs(); });
    setTimeout(pollMyNotifs, 1500);
})();


// ============ EGG PANEL (PILIH & GANTI) ============
let panelEggList = [];
function escapeEggHtml(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadPanelEggs(force) {
    if (panelEggList.length && !force) return panelEggList;
    try {
        const res = await fetch('/api/panel-eggs');
        const json = await res.json();
        if (json.success && json.data.length) {
            panelEggList = json.data;
            panelEggList._default = json.default_egg_id;
        }
    } catch (e) { console.log('Gagal ambil egg', e); }
    return panelEggList;
}

function eggOptionsHtml(list, selectedId) {
    return list.map(e => `<option value="${e.id}" ${String(e.id) === String(selectedId) ? 'selected' : ''}>${escapeEggHtml(e.name)}</option>`).join('');
}

async function initPanelEggSelect() {
    const sel = document.getElementById('panelEgg');
    if (!sel) return;
    const list = await loadPanelEggs();
    if (!list.length) {
        sel.innerHTML = '<option value="" data-empty="1">Egg default (daftar egg gagal dimuat)</option>';
        if (typeof checkOrder === 'function') checkOrder();
        return;
    }
    sel.innerHTML = eggOptionsHtml(list, list._default);
    const desc = document.getElementById('panelEggDesc');
    const upd = () => {
        const e = list.find(x => String(x.id) === sel.value);
        if (desc) desc.innerText = e && e.description ? e.description : '';
        if (typeof checkOrder === 'function') checkOrder();
    };
    sel.onchange = upd;
    upd();
}

async function openChangeEggModal(serverUuid, panelName) {
    const list = await loadPanelEggs();
    if (!list.length) return Swal.fire('Gagal', 'Daftar egg tidak bisa dimuat. Coba lagi nanti.', 'error');
    const { value: eggId } = await Swal.fire({
        title: 'Ganti Egg',
        html: `<div style="font-size:12px; text-align:left; margin-bottom:8px;">Panel: <b>${escapeEggHtml(panelName)}</b></div>
               <select id="swalEggSelect" class="swal2-select" style="width:90%; margin:0;">${eggOptionsHtml(list, null)}</select>
               <div style="font-size:11px; color:#e67e22; margin-top:10px; text-align:left;"><i class="fas fa-exclamation-triangle"></i> Server akan di-install ulang. Backup file pentingmu dulu.</div>`,
        showCancelButton: true,
        confirmButtonText: 'Ganti Egg',
        cancelButtonText: 'Batal',
        preConfirm: () => document.getElementById('swalEggSelect').value
    });
    if (!eggId) return;

    const { token } = checkLogin();
    if (!token) return window.location.href = '/login';
    Swal.fire({ title: 'Mengganti egg...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const res = await fetch('/api/change-panel-egg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, server_id: serverUuid, egg_id: eggId })
        });
        const data = await res.json();
        if (data.success) {
            await Swal.fire('Berhasil', data.message, 'success');
            const btnPanel = document.getElementById('menuPanelPopup');
            if (btnPanel) btnPanel.click();
        } else {
            Swal.fire('Gagal', data.message, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Gagal terhubung ke server.', 'error');
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPanelEggSelect); else initPanelEggSelect();
