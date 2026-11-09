import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMYR, parseMYRToCents } from '../public/common.js';
import { registerSchema, depositSchema } from '../src/schemas/index.js';
import { detectAllowedImage } from '../src/utils/image.js';

test('formats integer sen as MYR with two decimal places', () => {
  assert.equal(formatMYR(5000), 'RM50.00');
  assert.equal(formatMYR(5), 'RM0.05');
  assert.equal(formatMYR(123456), 'RM1,234.56');
});

test('parses decimal ringgit to integer sen without floating-point rounding', () => {
  assert.equal(parseMYRToCents('50'), 5000);
  assert.equal(parseMYRToCents('0.01'), 1);
  assert.equal(parseMYRToCents('12.3'), 1230);
});

test('rejects invalid or over-precise MYR inputs', () => {
  assert.throws(() => parseMYRToCents('1.234'), TypeError);
  assert.throws(() => parseMYRToCents('-1'), TypeError);
  assert.throws(() => parseMYRToCents('nope'), TypeError);
  assert.throws(() => formatMYR(1.5), TypeError);
});

test('register and deposit validation rejects unsafe input', () => {
  const registration = registerSchema.safeParse({
    username: 'market_user',
    email: 'user@example.com',
    password: 'strong-password-123',
    role: 'admin'
  });
  assert.equal(registration.success, true);
  assert.equal('role' in registration.data, false);
  assert.equal(registerSchema.safeParse({
    username: 'market_user',
    email: 'user@example.com',
    password: '密'.repeat(25)
  }).success, false);
  assert.equal(depositSchema.safeParse({ amount_cents: 5000, method: 'maybank' }).success, true);
  assert.equal(depositSchema.safeParse({ amount_cents: 1, method: 'maybank' }).success, false);
});

test('rejects files without an allowed image signature', async () => {
  assert.equal(await detectAllowedImage(Buffer.from('not an image')), null);
});
