import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, 'Username may contain letters, numbers, and underscores only.'),
  email: z.string().trim().email().max(254),
  password: z.string()
    .min(12, 'Password must be at least 12 characters.')
    .max(128)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password cannot exceed 72 UTF-8 bytes.')
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password cannot exceed 72 UTF-8 bytes.')
});

export const profileSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, 'Username may contain letters, numbers, and underscores only.').optional(),
  phone: z.string().trim().max(30).nullable().optional()
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field.');

export const depositSchema = z.object({
  amount_cents: z.coerce.number().int().min(100).max(100_000_000),
  method: z.enum(['tng_qr', 'maybank'])
});

export const depositReceiptSchema = z.object({
  deposit_request_id: z.string().uuid()
});

export const approveDepositSchema = z.object({
  bank_reference_no: z.string().trim().min(3).max(100)
});

export const rejectDepositSchema = z.object({
  admin_note: z.string().trim().min(3).max(500)
});

export const productSchema = z.object({
  category: z.enum(['panel_hosting', 'script_bot', 'vps', 'game_topup', 'subdomain', 'premium_app']),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(''),
  price_cents: z.number().int().min(1).max(10_000_000_000),
  stock: z.number().int().min(0).max(2_000_000_000),
  status: z.enum(['available', 'unavailable']),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const uuidSchema = z.string().uuid();
