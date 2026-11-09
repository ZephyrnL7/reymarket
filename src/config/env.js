import 'dotenv/config';
import { z } from 'zod';

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().url().refine(isHttpUrl).default('http://localhost:3000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_RECEIPTS_BUCKET: z.string().min(1).default('receipts-private'),
  SUPABASE_PRODUCT_IMAGES_BUCKET: z.string().min(1).default('product-images'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('20m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  TNG_QR_IMAGE_URL: z.string().url().refine(isHttpsUrl).or(z.literal('')).default(''),
  MAYBANK_ACCOUNT_NAME: z.string().default(''),
  MAYBANK_ACCOUNT_NUMBER: z.string().default('')
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = result.data;
