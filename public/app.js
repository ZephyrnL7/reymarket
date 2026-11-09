import { api, element, formatDate, formatMYR, parseMYRToCents, showNotice } from './common.js';

const state = {
  user: null,
  activeDeposit: null,
  paymentInstructions: null,
  authMode: 'login'
};

const notice = document.querySelector('#notice');
const authDialog = document.querySelector('#auth-dialog');
const categoryNames = {
  panel_hosting: 'Panel hosting',
  script_bot: 'Script bot',
  vps: 'VPS',
  game_topup: 'Game topup',
  subdomain: 'Subdomain',
  premium_app: 'Aplikasi premium'
};

function showError(error) {
  showNotice(notice, error.message ?? 'Sesuatu tidak berjaya. Cuba lagi.', 'error');
}

function clearNotice() {
  notice.classList.add('hidden');
}

function requireAccount(view) {
  if (state.user) return true;
  if (!authDialog.open) authDialog.showModal();
  if (view) state.afterAuthView = view;
  return false;
}

function setView(view) {
  document.querySelectorAll('.view-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `view-${view}`));
  document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  if (['deposit', 'orders', 'profile'].includes(view) && !requireAccount(view)) return;
  clearNotice();
  if (view === 'deposit') {
    loadDepositHistory();
    loadPaymentInstructions().catch(showError);
  }
  if (view === 'orders') loadTransactions();
  if (view === 'profile') loadNotifications();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateUserUI() {
  document.querySelector('#user-chip').textContent = state.user ? `Hai, ${state.user.username}` : 'Tetamu';
  document.querySelector('#auth-open').classList.toggle('hidden', Boolean(state.user));
  document.querySelector('#logout-button').classList.toggle('hidden', !state.user);
  document.querySelector('#balance-value').textContent = formatMYR(state.user?.saldo_cents ?? 0);
  document.querySelector('#balance-caption').textContent = state.user
    ? 'Baki semasa akaun anda'
    : 'Log masuk untuk melihat baki anda';

  const profileForm = document.querySelector('#profile-form');
  if (state.user) {
    profileForm.elements.username.value = state.user.username;
    profileForm.elements.email.value = state.user.email;
    profileForm.elements.phone.value = state.user.phone ?? '';
    document.querySelector('#account-meta').textContent = `Akaun dibuka ${formatDate(state.user.created_at)} · Peranan: ${state.user.role}`;
  }
}

function makeTable(headers, rows, emptyText) {
  if (!rows.length) return element('div', 'empty-state', emptyText);
  const table = element('table', 'data-table');
  const thead = element('thead');
  const headerRow = element('tr');
  headers.forEach((header) => headerRow.append(element('th', '', header)));
  thead.append(headerRow);
  const tbody = element('tbody');
  rows.forEach((cells) => {
    const row = element('tr');
    cells.forEach((cell) => {
      const td = element('td');
      if (cell instanceof Node) td.append(cell);
      else td.textContent = String(cell);
      row.append(td);
    });
    tbody.append(row);
  });
  table.append(thead, tbody);
  return table;
}

async function loadProducts() {
  const category = document.querySelector('#category-filter').value;
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  const { products } = await api(`/api/products${query}`);
  const grid = document.querySelector('#product-grid');
  grid.replaceChildren();
  if (!products.length) {
    grid.append(element('div', 'empty-state', 'Belum ada produk untuk kategori ini.'));
    return;
  }

  products.forEach((product) => {
    const card = element('article', 'product-card');
    if (product.image_url) {
      const image = element('img', 'product-image');
      image.src = product.image_url;
      image.alt = product.name;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      card.append(image);
    }
    const top = element('div', 'product-card-top');
    top.append(element('span', 'product-icon', product.name.trim().charAt(0).toUpperCase() || 'D'));
    top.append(element('span', 'category-tag', categoryNames[product.category] ?? product.category));
    const name = element('h3', '', product.name);
    const description = element('p', 'product-description', product.description || 'Produk digital pilihan RikiMarket.');
    const bottom = element('div', 'product-card-bottom');
    const price = element('span', 'product-price', formatMYR(product.price_cents));
    const action = element('button', 'button button-primary button-small', 'Beli');
    action.type = 'button';
    action.addEventListener('click', () => purchase(product));
    bottom.append(price, action);
    bottom.append(element('span', 'stock-note', `${product.stock} unit tersedia`));
    card.append(top, name, description, bottom);
    grid.append(card);
  });
}

async function purchase(product) {
  if (!requireAccount()) return;
  if (!window.confirm(`Beli ${product.name} pada harga ${formatMYR(product.price_cents)}?`)) return;
  try {
    const { transaction } = await api(`/api/purchase/${encodeURIComponent(product.id)}`, { method: 'POST' });
    showNotice(notice, `Pembelian berjaya. Nombor pesanan: ${transaction.order_id}`, 'success');
    await loadProfile();
    await loadProducts();
  } catch (error) {
    showError(error);
  }
}

async function loadProfile() {
  try {
    const { user } = await api('/api/user/profile');
    state.user = user;
    updateUserUI();
  } catch (error) {
    if (error.status !== 401) throw error;
    state.user = null;
    updateUserUI();
  }
}

async function loadPaymentInstructions() {
  if (!state.paymentInstructions) {
    const result = await api('/api/payment-instructions');
    state.paymentInstructions = result;
  }
  renderPaymentInstructions();
}

function renderPaymentInstructions() {
  const target = document.querySelector('#payment-instructions');
  const methodSelect = document.querySelector('#deposit-intent-form').elements.method;
  const method = methodSelect.value;
  target.replaceChildren();
  const instructions = state.paymentInstructions;
  if (instructions) {
    methodSelect.querySelector('[value="tng_qr"]').disabled = !instructions.tng_configured;
    methodSelect.querySelector('[value="maybank"]').disabled = !instructions.maybank_configured;
    const selectedConfigured = method === 'tng_qr' ? instructions.tng_configured : instructions.maybank_configured;
    if (!selectedConfigured) {
      const available = methodSelect.querySelector('option:not(:disabled)');
      if (available) methodSelect.value = available.value;
      document.querySelector('#deposit-intent-form button[type="submit"]').disabled = !available;
      if (!available) {
        target.append(element('p', 'hint', 'Tiada kaedah pembayaran yang dikonfigurasi. Sila hubungi pentadbir.'));
        return;
      }
      return renderPaymentInstructions();
    }
    document.querySelector('#deposit-intent-form button[type="submit"]').disabled = false;
  }
  if (method === 'tng_qr') {
    if (instructions?.tng_qr_image_url) {
      const image = element('img');
      image.src = instructions.tng_qr_image_url;
      image.alt = 'Kod QR pembayaran Touch n Go';
      target.append(image);
    } else {
      target.append(element('div', 'empty-state', 'Kod QR TNG belum dikonfigurasi. Sila hubungi pentadbir sebelum membuat pindahan.'));
    }
    const text = element('div');
    text.append(element('strong', '', "Touch 'n Go eWallet"));
    text.append(element('p', '', 'Imbas QR dan masukkan kod rujukan dalam catatan pindahan.'));
    target.append(text);
  } else {
    const text = element('div');
    text.append(element('strong', '', 'Pindahan Maybank'));
    text.append(element('p', '', instructions?.maybank_account_name || 'Maklumat pemegang akaun belum dikonfigurasi.'));
    text.append(element('p', '', instructions?.maybank_account_number || 'Nombor akaun belum dikonfigurasi.'));
    text.append(element('p', '', 'Sertakan kod rujukan dalam catatan pindahan.'));
    target.append(text);
  }
}

async function loadDepositHistory() {
  if (!state.user) return;
  try {
    const { requests } = await api('/api/user/deposit-requests');
    const rows = requests.map((request) => [
      request.reference_code,
      formatMYR(request.amount_cents),
      request.method === 'tng_qr' ? 'TNG QR' : 'Maybank',
      statusPill(request.status),
      request.admin_note || formatDate(request.created_at)
    ]);
    document.querySelector('#deposit-history').replaceChildren(
      makeTable(['Rujukan', 'Jumlah', 'Kaedah', 'Status', 'Maklumat'], rows, 'Belum ada permintaan deposit.')
    );
  } catch (error) {
    showError(error);
  }
}

function statusPill(status) {
  return element('span', `status-pill ${status}`, status.replaceAll('_', ' '));
}

async function loadTransactions() {
  if (!state.user) return;
  try {
    const { transactions } = await api('/api/user/transactions');
    const rows = transactions.map((item) => [
      item.order_id,
      item.type === 'deposit' ? 'Deposit' : (item.product_name_snapshot || 'Pembelian'),
      formatMYR(item.amount_cents),
      statusPill(item.status),
      formatDate(item.created_at)
    ]);
    document.querySelector('#transaction-list').replaceChildren(
      makeTable(['Rujukan', 'Jenis', 'Jumlah', 'Status', 'Tarikh'], rows, 'Belum ada transaksi.')
    );
  } catch (error) {
    showError(error);
  }
}

async function loadNotifications() {
  if (!state.user) return;
  try {
    const { notifications } = await api('/api/user/notifications');
    const list = document.querySelector('#notification-list');
    list.replaceChildren();
    if (!notifications.length) {
      list.append(element('p', 'hint', 'Tiada pemberitahuan baharu.'));
      return;
    }
    notifications.forEach((item) => {
      const row = element('div', 'notification-row');
      row.append(element('div', '', item.message));
      row.append(element('small', '', formatDate(item.created_at)));
      list.append(row);
    });
  } catch (error) {
    showError(error);
  }
}

function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelector('#auth-title').textContent = mode === 'login' ? 'Log masuk' : 'Cipta akaun';
  document.querySelector('#auth-username-wrap').classList.toggle('hidden', mode !== 'register');
  document.querySelector('#auth-email-wrap').classList.toggle('hidden', mode !== 'register');
  document.querySelector('#auth-identifier-wrap').classList.toggle('hidden', mode !== 'login');
  document.querySelector('#auth-username-wrap input').required = mode === 'register';
  document.querySelector('#auth-email-wrap input').required = mode === 'register';
  document.querySelector('#auth-identifier-wrap input').required = mode === 'login';
  document.querySelector('#auth-submit').textContent = mode === 'login' ? 'Log masuk' : 'Daftar akaun';
  document.querySelectorAll('[data-auth-mode]').forEach((button) => button.classList.toggle('active', button.dataset.authMode === mode));
}

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelector('#auth-open').addEventListener('click', () => authDialog.showModal());
document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
document.querySelector('#category-filter').addEventListener('change', () => loadProducts().catch(showError));

document.querySelector('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  try {
    if (state.authMode === 'login') {
      const { user } = await api('/api/auth/login', {
        method: 'POST',
        body: { identifier: values.get('identifier'), password: values.get('password') }
      });
      state.user = user;
    } else {
      const { user } = await api('/api/auth/register', {
        method: 'POST',
        body: { username: values.get('username'), email: values.get('email'), password: values.get('password') }
      });
      state.user = user;
    }
    authDialog.close();
    form.reset();
    updateUserUI();
    showNotice(notice, `Selamat datang, ${state.user.username}.`, 'success');
    if (state.afterAuthView) {
      const view = state.afterAuthView;
      state.afterAuthView = null;
      setView(view);
    }
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null;
    updateUserUI();
    showNotice(notice, 'Anda telah log keluar.', 'success');
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#deposit-intent-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!requireAccount('deposit')) return;
  const form = event.currentTarget;
  try {
    if (!state.paymentInstructions) await loadPaymentInstructions();
    const methodConfigured = form.elements.method.value === 'tng_qr'
      ? state.paymentInstructions?.tng_configured
      : state.paymentInstructions?.maybank_configured;
    if (!methodConfigured) throw new Error('Kaedah pembayaran ini belum dikonfigurasi.');
    const amountCents = parseMYRToCents(form.elements.amount.value);
    const { request } = await api('/api/deposit-request/intent', {
      method: 'POST',
      body: { amount_cents: amountCents, method: form.elements.method.value }
    });
    state.activeDeposit = request;
    document.querySelector('#deposit-reference').textContent = request.reference_code;
    document.querySelector('#receipt-form').elements.deposit_request_id.value = request.id;
    document.querySelector('#deposit-next-step').classList.remove('hidden');
    await loadPaymentInstructions();
    await loadDepositHistory();
    showNotice(notice, 'Kod rujukan dijana. Buat pindahan dahulu, kemudian muat naik resit.', 'success');
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#deposit-intent-form').elements.method.addEventListener('change', renderPaymentInstructions);

document.querySelector('#copy-reference').addEventListener('click', async () => {
  if (!state.activeDeposit) return;
  try {
    await navigator.clipboard.writeText(state.activeDeposit.reference_code);
    showNotice(notice, 'Kod rujukan disalin.', 'success');
  } catch {
    showNotice(notice, `Kod rujukan: ${state.activeDeposit.reference_code}`, 'success');
  }
});

document.querySelector('#receipt-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!requireAccount('deposit')) return;
  const form = event.currentTarget;
  const image = form.elements.receipt.files[0];
  if (!image) return showNotice(notice, 'Pilih gambar resit dahulu.', 'error');
  const body = new FormData();
  body.set('deposit_request_id', form.elements.deposit_request_id.value);
  body.set('receipt', image);
  try {
    const { request } = await api('/api/deposit-request', { method: 'POST', body });
    state.activeDeposit = null;
    form.reset();
    document.querySelector('#deposit-next-step').classList.add('hidden');
    document.querySelector('#deposit-intent-form').reset();
    await loadDepositHistory();
    showNotice(notice, `Resit ${request.reference_code} diterima dan menunggu semakan admin.`, 'success');
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const { user } = await api('/api/user/profile', {
      method: 'PATCH',
      body: { username: form.elements.username.value, phone: form.elements.phone.value || null }
    });
    state.user = user;
    updateUserUI();
    showNotice(notice, 'Profil berjaya dikemas kini.', 'success');
  } catch (error) {
    showError(error);
  }
});

async function initialize() {
  try {
    await loadProducts();
    await loadProfile();
  } catch (error) {
    showError(error);
  }
}

initialize();
