import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { supabase } from '../config/supabase.js';
import { config } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { requireSameOrigin } from '../middleware/security.js';
import { validate } from '../middleware/validate.js';
import { depositReceiptSchema, depositSchema } from '../schemas/index.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { detectAllowedImage } from '../utils/image.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});
function createDepositRateLimit() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    keyGenerator: (req) => req.user.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'DEPOSIT_RATE_LIMITED', message: 'Maximum 5 deposit submissions per hour.' } }
  });
}
const depositIntentRateLimit = createDepositRateLimit();
const depositReceiptRateLimit = createDepositRateLimit();
function newReferenceCode() {
  return `DEP-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
}

export function notifyAdmin(message) {
  console.info('[admin-notification-placeholder]', message);
}

router.post('/intent', requireAuth, requireSameOrigin, depositIntentRateLimit, validate(depositSchema), asyncHandler(async (req, res) => {
  const { amount_cents: amountCents, method } = req.validated.body;
  const paymentConfigured = method === 'tng_qr'
    ? Boolean(config.TNG_QR_IMAGE_URL)
    : Boolean(config.MAYBANK_ACCOUNT_NAME && config.MAYBANK_ACCOUNT_NUMBER);
  if (!paymentConfigured) {
    throw new AppError(503, 'PAYMENT_METHOD_UNAVAILABLE', 'This payment method is not configured yet.');
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: request, error } = await supabase
      .from('deposit_requests')
      .insert({
        reference_code: newReferenceCode(),
        user_id: req.user.id,
        amount_cents: amountCents,
        method,
        status: 'awaiting_receipt'
      })
      .select('id, reference_code, amount_cents, method, status, created_at')
      .single();

    if (!error) {
      return res.status(201).json({ data: { request } });
    }
    if (error.code !== '23505') {
      console.error('Deposit intent creation failed:', error);
      throw new AppError(500, 'DEPOSIT_INTENT_FAILED', 'Could not create your deposit request.');
    }
  }
  throw new AppError(503, 'REFERENCE_GENERATION_FAILED', 'Could not generate a unique reference. Please try again.');
}));

router.post('/', requireAuth, requireSameOrigin, depositReceiptRateLimit, upload.single('receipt'), validate(depositReceiptSchema), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'RECEIPT_REQUIRED', 'Upload a receipt image to continue.');

  const { deposit_request_id: depositRequestId } = req.validated.body;
  const { data: request, error: requestError } = await supabase
    .from('deposit_requests')
    .select('id, reference_code, amount_cents, method, status')
    .eq('id', depositRequestId)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (requestError) {
    console.error('Deposit intent lookup failed:', requestError);
    throw new AppError(500, 'DEPOSIT_LOOKUP_FAILED', 'Could not load your deposit request.');
  }
  if (!request) throw new AppError(404, 'DEPOSIT_NOT_FOUND', 'Deposit request was not found.');
  if (request.status !== 'awaiting_receipt') throw new AppError(409, 'DEPOSIT_NOT_AWAITING_RECEIPT', 'This request is not waiting for a receipt.');

  const detected = await detectAllowedImage(req.file.buffer);
  if (!detected) {
    throw new AppError(415, 'INVALID_RECEIPT_TYPE', 'Receipt must be a JPEG, PNG, or WebP image.');
  }

  const receiptHash = createHash('sha256').update(req.file.buffer).digest('hex');
  const { data: duplicate, error: duplicateError } = await supabase
    .from('deposit_requests')
    .select('id')
    .eq('receipt_hash', receiptHash)
    .maybeSingle();
  if (duplicateError) {
    console.error('Receipt duplicate check failed:', duplicateError);
    throw new AppError(500, 'RECEIPT_CHECK_FAILED', 'Could not validate this receipt.');
  }
  if (duplicate) throw new AppError(409, 'RECEIPT_ALREADY_USED', 'This receipt image has already been submitted.');

  const receiptPath = `${req.user.id}/${randomUUID()}.${detected.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(config.SUPABASE_RECEIPTS_BUCKET)
    .upload(receiptPath, req.file.buffer, {
      contentType: detected.mime,
      cacheControl: '0',
      upsert: false
    });

  if (uploadError) {
    console.error('Private receipt upload failed:', uploadError);
    throw new AppError(500, 'RECEIPT_UPLOAD_FAILED', 'Could not securely store your receipt.');
  }

  const { data: updatedRequest, error: updateError } = await supabase
    .from('deposit_requests')
    .update({
      receipt_path: receiptPath,
      receipt_hash: receiptHash,
      status: 'pending'
    })
    .eq('id', depositRequestId)
    .eq('user_id', req.user.id)
    .eq('status', 'awaiting_receipt')
    .select('id, reference_code, amount_cents, method, status, created_at')
    .maybeSingle();

  if (updateError || !updatedRequest) {
    const { error: cleanupError } = await supabase.storage.from(config.SUPABASE_RECEIPTS_BUCKET).remove([receiptPath]);
    if (cleanupError) console.error('Failed to remove orphaned receipt:', cleanupError);
    if (updateError?.code === '23505') {
      throw new AppError(409, 'RECEIPT_ALREADY_USED', 'This receipt image or reference has already been submitted.');
    }
    if (!updateError) throw new AppError(409, 'DEPOSIT_NOT_AWAITING_RECEIPT', 'This request is no longer waiting for a receipt.');
    console.error('Deposit receipt submission failed:', updateError);
    throw new AppError(500, 'DEPOSIT_CREATE_FAILED', 'Could not submit your receipt.');
  }

  notifyAdmin(`Deposit ${updatedRequest.reference_code} submitted by ${req.user.username} for ${updatedRequest.amount_cents} sen.`);
  res.status(201).json({ data: { request: updatedRequest } });
}));

export default router;
