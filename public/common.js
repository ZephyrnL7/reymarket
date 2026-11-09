export function formatMYR(cents) {
  const value = Number(cents);
  if (!Number.isSafeInteger(value)) throw new TypeError('Currency amount must be an integer number of sen.');
  return `RM${(value / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function parseMYRToCents(amount) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount).trim());
  if (!match) throw new TypeError('Enter an amount with up to two decimal places.');
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError('Amount is too large.');
  return Number(cents);
}

export function formatDate(value) {
  return new Date(value).toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' });
}

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request(path, options, retry) {
  const headers = new Headers(options.headers ?? {});
  const bodyIsFormData = options.body instanceof FormData;
  if (options.body && !bodyIsFormData && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
    body: options.body && !bodyIsFormData && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });

  if (response.status === 401 && retry && !path.includes('/api/auth/')) {
    const refreshed = await fetch('/api/auth/refresh-token', { method: 'POST', credentials: 'same-origin' });
    if (refreshed.ok) return request(path, options, false);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      payload.error?.code ?? 'REQUEST_FAILED',
      payload.error?.message ?? 'Request could not be completed.',
      response.status
    );
  }
  return payload.data;
}

export function api(path, options = {}) {
  return request(path, options, true);
}

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function showNotice(node, message, kind = '') {
  node.textContent = message;
  node.className = `status-banner${kind ? ` ${kind}` : ''}`;
  node.classList.remove('hidden');
}
