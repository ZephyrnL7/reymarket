import { api, element, formatDate, formatMYR, parseMYRToCents, showNotice } from './common.js';

const state = { user: null, products: [] };
const loginPanel = document.querySelector('#admin-login-panel');
const consolePanel = document.querySelector('#admin-console');
const loginNotice = document.querySelector('#admin-login-notice');
const notice = document.querySelector('#admin-notice');

function showError(target, error) {
  showNotice(target, error.message ?? 'Sesuatu tidak berjaya. Cuba lagi.', 'error');
}

function table(headers, rows, emptyText) {
  if (!rows.length) return element('div', 'empty-state', emptyText);
  const tableNode = element('table', 'data-table');
  const head = element('thead');
  const headRow = element('tr');
  headers.forEach((value) => headRow.append(element('th', '', value)));
  head.append(headRow);
  const body = element('tbody');
  rows.forEach((cells) => {
    const row = element('tr');
    cells.forEach((cell) => {
      const td = element('td');
      if (cell instanceof Node) td.append(cell);
      else td.textContent = String(cell);
      row.append(td);
    });
    body.append(row);
  });
  tableNode.append(head, body);
  return tableNode;
}

function statusPill(status) {
  return element('span', `status-pill ${status}`, status.replaceAll('_', ' '));
}

async function openConsole(user) {
  if (user.role !== 'admin') {
    loginPanel.classList.remove('hidden');
    showNotice(loginNotice, 'Akaun ini bukan akaun pentadbir.', 'error');
    return;
  }
  state.user = user;
  loginPanel.classList.add('hidden');
  consolePanel.classList.remove('hidden');
  document.querySelector('#admin-identity').textContent = user.username;
  document.querySelector('#admin-logout').classList.remove('hidden');
  try {
    await Promise.all([loadStats(), loadDeposits(), loadProducts(), loadUsers()]);
  } catch (error) {
    showError(notice, error);
  }
}

async function loadStats() {
  const { stats } = await api('/api/admin/stats');
  const cards = [
    ['Pengguna', stats.users_count],
    ['Produk', stats.products_count],
    ['Deposit pending', stats.pending_deposits_count],
    ['Deposit diluluskan', formatMYR(stats.approved_deposits_cents)]
  ];
  const target = document.querySelector('#admin-stats');
  target.replaceChildren();
  cards.forEach(([label, value]) => {
    const card = element('div', 'stat-card');
    card.append(element('span', '', label), element('strong', '', String(value)));
    target.append(card);
  });
}

async function loadDeposits() {
  const { requests } = await api('/api/admin/deposit-requests?status=pending');
  const target = document.querySelector('#admin-deposits');
  target.replaceChildren();
  if (!requests.length) {
    target.append(element('div', 'empty-state', 'Tiada permintaan deposit menunggu semakan.'));
    return;
  }

  requests.forEach((request) => {
    const item = element('article', 'admin-item');
    const info = element('div');
    info.append(element('h3', '', request.reference_code));
    info.append(element('p', '', `${request.user.username} · ${request.user.email}`));
    info.append(element('p', '', `${formatMYR(request.amount_cents)} · ${request.method === 'tng_qr' ? 'Touch n Go' : 'Maybank'} · ${formatDate(request.created_at)}`));
    info.append(statusPill(request.status));

    const actions = element('div');
    if (request.receipt_url) {
      const receiptLink = element('a', 'text-button', 'Buka resit (pautan selamat, 5 minit)');
      receiptLink.href = request.receipt_url;
      receiptLink.target = '_blank';
      receiptLink.rel = 'noopener noreferrer';
      receiptLink.referrerPolicy = 'no-referrer';
      const preview = element('div', 'receipt-preview');
      const image = element('img');
      image.src = request.receipt_url;
      image.alt = `Resit ${request.reference_code}`;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      preview.append(image);
      actions.append(receiptLink, preview);
    } else {
      actions.append(element('p', '', 'Tiada resit dimuat naik.'));
    }

    const form = element('div', 'admin-item-actions');
    const bankReference = element('input', 'reference-input');
    bankReference.placeholder = 'No. rujukan transaksi bank (wajib)';
    bankReference.setAttribute('aria-label', 'Nombor rujukan transaksi bank');
    const rejectReason = element('input');
    rejectReason.placeholder = 'Sebab penolakan (wajib)';
    rejectReason.setAttribute('aria-label', 'Sebab penolakan');
    const approveButton = element('button', 'button button-primary', 'Luluskan');
    approveButton.type = 'button';
    approveButton.addEventListener('click', async () => {
      if (bankReference.value.trim().length < 3) {
        bankReference.focus();
        return showNotice(notice, 'Masukkan nombor rujukan transaksi bank selepas menyemak aplikasi bank anda.', 'error');
      }
      if (!window.confirm(`Luluskan ${request.reference_code} dan kreditkan ${formatMYR(request.amount_cents)}?`)) return;
      try {
        await api(`/api/admin/deposit-request/${encodeURIComponent(request.id)}/approve`, {
          method: 'POST',
          body: { bank_reference_no: bankReference.value.trim() }
        });
        showNotice(notice, `Deposit ${request.reference_code} diluluskan.`, 'success');
        await Promise.all([loadStats(), loadDeposits()]);
      } catch (error) {
        showError(notice, error);
      }
    });
    const rejectButton = element('button', 'button button-danger', 'Tolak');
    rejectButton.type = 'button';
    rejectButton.addEventListener('click', async () => {
      if (rejectReason.value.trim().length < 3) {
        rejectReason.focus();
        return showNotice(notice, 'Masukkan sebab penolakan untuk pelanggan.', 'error');
      }
      try {
        await api(`/api/admin/deposit-request/${encodeURIComponent(request.id)}/reject`, {
          method: 'POST',
          body: { admin_note: rejectReason.value.trim() }
        });
        showNotice(notice, `Deposit ${request.reference_code} ditolak dan pelanggan dimaklumkan.`, 'success');
        await Promise.all([loadStats(), loadDeposits()]);
      } catch (error) {
        showError(notice, error);
      }
    });
    form.append(bankReference, approveButton, rejectReason, rejectButton);
    actions.append(form);
    item.append(info, actions);
    target.append(item);
  });
}

async function loadProducts() {
  const { products } = await api('/api/admin/products');
  state.products = products;
  const target = document.querySelector('#admin-products');
  target.replaceChildren();
  if (!products.length) {
    target.append(element('div', 'empty-state', 'Belum ada produk. Tambah produk pertama anda.'));
    return;
  }

  products.forEach((product) => {
    const row = element('article', 'admin-product-row');
    const details = element('div');
    if (product.image_url) {
      const image = element('img', 'admin-product-image');
      image.src = product.image_url;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      details.append(image);
    }
    details.append(element('strong', '', product.name));
    details.append(element('small', '', `${product.category} · ${formatMYR(product.price_cents)} · stok ${product.stock} · ${product.status}`));
    const actions = element('div', 'row-actions');
    const edit = element('button', 'button button-outline button-small', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => editProduct(product));
    const remove = element('button', 'button button-danger button-small', 'Padam');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Padam produk ${product.name}?`)) return;
      try {
        const result = await api(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
        showNotice(notice, result.image_cleanup_pending
          ? `Produk ${product.name} dipadam; pembersihan imej memerlukan semakan.`
          : `Produk ${product.name} dipadam.`, result.image_cleanup_pending ? '' : 'success');
        await Promise.all([loadProducts(), loadStats()]);
      } catch (error) {
        showError(notice, error);
      }
    });
    actions.append(edit, remove);
    row.append(details, actions);
    target.append(row);
  });
}

function editProduct(product) {
  const form = document.querySelector('#product-form');
  form.classList.remove('hidden');
  form.elements.id.value = product?.id ?? '';
  form.elements.name.value = product?.name ?? '';
  form.elements.category.value = product?.category ?? 'panel_hosting';
  form.elements.price.value = product ? (product.price_cents / 100).toFixed(2) : '';
  form.elements.stock.value = product?.stock ?? 0;
  form.elements.status.value = product?.status ?? 'available';
  form.elements.description.value = product?.description ?? '';
  form.elements.image.value = '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function loadUsers() {
  const { users } = await api('/api/admin/users');
  const rows = users.map((user) => [
    user.username,
    user.email,
    user.phone || '—',
    formatMYR(user.saldo_cents),
    formatDate(user.created_at)
  ]);
  document.querySelector('#admin-users').replaceChildren(
    table(['Nama pengguna', 'E-mel', 'Telefon', 'Saldo', 'Daftar'], rows, 'Tiada pengguna.')
  );
}

document.querySelector('#admin-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      body: { identifier: values.get('identifier'), password: values.get('password') }
    });
    await openConsole(user);
    form.reset();
  } catch (error) {
    showError(loginNotice, error);
  }
});

document.querySelector('#admin-logout').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null;
    consolePanel.classList.add('hidden');
    loginPanel.classList.remove('hidden');
    document.querySelector('#admin-logout').classList.add('hidden');
  } catch (error) {
    showError(notice, error);
  }
});

document.querySelector('#refresh-deposits').addEventListener('click', () => loadDeposits().catch((error) => showError(notice, error)));
document.querySelector('#new-product').addEventListener('click', () => editProduct(null));
document.querySelector('#cancel-product').addEventListener('click', () => document.querySelector('#product-form').classList.add('hidden'));
document.querySelectorAll('[data-admin-view]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-admin-view]').forEach((tab) => tab.classList.toggle('active', tab === button));
    document.querySelectorAll('.admin-view').forEach((view) => view.classList.toggle('hidden', view.id !== `admin-${button.dataset.adminView}-view`));
  });
});

document.querySelector('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const body = {
      category: form.elements.category.value,
      name: form.elements.name.value.trim(),
      description: form.elements.description.value.trim(),
      price_cents: parseMYRToCents(form.elements.price.value),
      stock: Number(form.elements.stock.value),
      status: form.elements.status.value,
      metadata: {}
    };
    const id = form.elements.id.value;
    const { product } = await api(id ? `/api/admin/products/${encodeURIComponent(id)}` : '/api/admin/products', {
      method: id ? 'PATCH' : 'POST',
      body
    });
    const image = form.elements.image.files[0];
    let imageCleanupPending = false;
    if (image) {
      const imageBody = new FormData();
      imageBody.set('image', image);
      try {
        const imageResult = await api(`/api/admin/products/${encodeURIComponent(product.id)}/image`, { method: 'POST', body: imageBody });
        imageCleanupPending = imageResult.old_image_cleanup_pending;
      } catch (error) {
        await Promise.all([loadProducts(), loadStats()]);
        throw new Error(`Produk berjaya disimpan tetapi gambar gagal dimuat naik: ${error.message}`);
      }
    }
    form.reset();
    form.classList.add('hidden');
    showNotice(notice, imageCleanupPending
      ? 'Produk berjaya disimpan; pembersihan imej lama memerlukan semakan.'
      : 'Produk berjaya disimpan.', imageCleanupPending ? '' : 'success');
    await Promise.all([loadProducts(), loadStats()]);
  } catch (error) {
    showError(notice, error);
  }
});

async function initialize() {
  try {
    const { user } = await api('/api/user/profile');
    await openConsole(user);
  } catch (error) {
    loginPanel.classList.remove('hidden');
    if (error.status !== 401) showError(loginNotice, error);
  }
}

initialize();
