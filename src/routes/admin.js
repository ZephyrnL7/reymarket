import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { config } from '../config/env.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requireSameOrigin } from '../middleware/security.js';
import { validate } from '../middleware/validate.js';
import { approveDepositSchema, productSchema, rejectDepositSchema } from '../schemas/index.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { detectAllowedImage } from '../utils/image.js';

const router = Router();
router.use(requireAuth, requireAdmin);
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

const depositListSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'expired']).default('pending')
});
const userListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
const idSchema = z.string().uuid();

function throwRpcError(error, operation) {
  const message = error?.message ?? '';
  if (message.includes('deposit_not_pending')) throw new AppError(409, 'DEPOSIT_NOT_PENDING', 'This deposit request has already been reviewed or expired.');
  if (message.includes('bank_reference_required')) throw new AppError(400, 'BANK_REFERENCE_REQUIRED', 'Enter the bank reference number you verified.');
  if (message.includes('rejection_reason_required')) throw new AppError(400, 'REJECTION_REASON_REQUIRED', 'Enter a reason for rejecting this request.');
  if (message.includes('balance_limit_reached')) throw new AppError(409, 'BALANCE_LIMIT_REACHED', 'This balance cannot accept another deposit.');
  if (message.includes('user_not_found')) throw new AppError(404, 'USER_NOT_FOUND', 'The deposit owner was not found.');
  if (message.includes('product_not_found')) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found.');
  if (message.includes('admin_required')) throw new AppError(403, 'ADMIN_REQUIRED', 'Administrator access is required.');
  console.error(`${operation} failed:`, error);
  throw new AppError(500, 'ADMIN_OPERATION_FAILED', 'Could not complete the administrator operation.');
}

router.get('/deposit-requests', validate(depositListSchema, 'query'), asyncHandler(async (req, res) => {
  const { data: requests, error } = await supabase
    .from('deposit_requests')
    .select('id, reference_code, user_id, amount_cents, method, receipt_path, status, bank_reference_no, admin_note, created_at, reviewed_at')
    .eq('status', req.validated.query.status)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) {
    console.error('Admin deposit request list failed:', error);
    throw new AppError(500, 'ADMIN_DEPOSITS_FAILED', 'Could not load deposit requests.');
  }

  const result = await Promise.all(requests.map(async (request) => {
    const [{ data: user, error: userError }, signedResult] = await Promise.all([
      supabase.from('users').select('username, email').eq('id', request.user_id).single(),
      request.receipt_path
        ? supabase.storage.from(config.SUPABASE_RECEIPTS_BUCKET).createSignedUrl(request.receipt_path, 5 * 60)
        : Promise.resolve({ data: null, error: null })
    ]);
    if (userError || signedResult.error) {
      console.error('Admin receipt detail lookup failed:', userError ?? signedResult.error);
      throw new AppError(500, 'ADMIN_DEPOSIT_DETAIL_FAILED', 'Could not securely load a deposit receipt.');
    }
    const { receipt_path: _receiptPath, user_id: _userId, ...safeRequest } = request;
    return { ...safeRequest, user, receipt_url: signedResult.data?.signedUrl ?? null };
  }));
  res.json({ data: { requests: result } });
}));

router.post('/deposit-request/:id/approve', requireSameOrigin, validate(approveDepositSchema), asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) throw new AppError(400, 'INVALID_DEPOSIT_ID', 'Deposit request id is invalid.');
  const { data, error } = await supabase.rpc('approve_deposit', {
    p_deposit_id: id.data,
    p_admin_id: req.user.id,
    p_bank_reference_no: req.validated.body.bank_reference_no
  });
  if (error) throwRpcError(error, 'Deposit approval');
  res.json({ data: { request: data } });
}));

router.post('/deposit-request/:id/reject', requireSameOrigin, validate(rejectDepositSchema), asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) throw new AppError(400, 'INVALID_DEPOSIT_ID', 'Deposit request id is invalid.');
  const { data, error } = await supabase.rpc('reject_deposit', {
    p_deposit_id: id.data,
    p_admin_id: req.user.id,
    p_admin_note: req.validated.body.admin_note
  });
  if (error) throwRpcError(error, 'Deposit rejection');
  res.json({ data: { request: data } });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.rpc('admin_stats', { p_admin_id: req.user.id });
  if (error) throwRpcError(error, 'Admin statistics');
  res.json({ data: { stats: data } });
}));

router.get('/products', asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('id, category, name, description, price_cents, stock, status, image_url, metadata, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Admin product list failed:', error);
    throw new AppError(500, 'ADMIN_PRODUCTS_FAILED', 'Could not load products.');
  }
  res.json({ data: { products: data } });
}));

async function saveProduct(req, res, productId) {
  const { data, error } = await supabase.rpc('save_admin_product', {
    p_admin_id: req.user.id,
    p_product_id: productId,
    p_category: req.validated.body.category,
    p_name: req.validated.body.name,
    p_description: req.validated.body.description,
    p_price_cents: req.validated.body.price_cents,
    p_stock: req.validated.body.stock,
    p_status: req.validated.body.status,
    p_metadata: req.validated.body.metadata
  });
  if (error) throwRpcError(error, 'Product save');
  res.status(productId ? 200 : 201).json({ data: { product: data } });
}

router.post('/products', requireSameOrigin, validate(productSchema), asyncHandler((req, res) => saveProduct(req, res, null)));
router.patch('/products/:id', requireSameOrigin, validate(productSchema), asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) throw new AppError(400, 'INVALID_PRODUCT_ID', 'Product id is invalid.');
  await saveProduct(req, res, id.data);
}));

router.post('/products/:id/image', requireSameOrigin, imageUpload.single('image'), asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) throw new AppError(400, 'INVALID_PRODUCT_ID', 'Product id is invalid.');
  if (!req.file) throw new AppError(400, 'PRODUCT_IMAGE_REQUIRED', 'Choose a product image to upload.');

  const detected = await detectAllowedImage(req.file.buffer);
  if (!detected) throw new AppError(415, 'INVALID_PRODUCT_IMAGE', 'Product image must be JPEG, PNG, or WebP.');
  const { data: current, error: currentError } = await supabase
    .from('products')
    .select('id, image_path')
    .eq('id', id.data)
    .maybeSingle();
  if (currentError) {
    console.error('Product image target lookup failed:', currentError);
    throw new AppError(500, 'PRODUCT_IMAGE_FAILED', 'Could not load the product.');
  }
  if (!current) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found.');

  const imagePath = `${id.data}/${randomUUID()}.${detected.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(config.SUPABASE_PRODUCT_IMAGES_BUCKET)
    .upload(imagePath, req.file.buffer, { contentType: detected.mime, cacheControl: '3600', upsert: false });
  if (uploadError) {
    console.error('Product image upload failed:', uploadError);
    throw new AppError(500, 'PRODUCT_IMAGE_UPLOAD_FAILED', 'Could not store the product image.');
  }

  const { data: publicUrl } = supabase.storage.from(config.SUPABASE_PRODUCT_IMAGES_BUCKET).getPublicUrl(imagePath);
  const { data: product, error: updateError } = await supabase.rpc('set_admin_product_image', {
    p_admin_id: req.user.id,
    p_product_id: id.data,
    p_image_path: imagePath,
    p_image_url: publicUrl.publicUrl
  });
  if (updateError) {
    const { error: cleanupError } = await supabase.storage.from(config.SUPABASE_PRODUCT_IMAGES_BUCKET).remove([imagePath]);
    if (cleanupError) console.error('Failed to remove orphaned product image:', cleanupError);
    throwRpcError(updateError, 'Product image update');
  }

  let oldImageCleanupPending = false;
  if (current.image_path) {
    const { error: removeError } = await supabase.storage.from(config.SUPABASE_PRODUCT_IMAGES_BUCKET).remove([current.image_path]);
    if (removeError) {
      oldImageCleanupPending = true;
      console.error('Old product image cleanup failed:', removeError);
    }
  }
  res.json({ data: { product, old_image_cleanup_pending: oldImageCleanupPending } });
}));

router.delete('/products/:id', requireSameOrigin, asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) throw new AppError(400, 'INVALID_PRODUCT_ID', 'Product id is invalid.');
  const { data: current, error: currentError } = await supabase
    .from('products')
    .select('image_path')
    .eq('id', id.data)
    .maybeSingle();
  if (currentError) {
    console.error('Product deletion lookup failed:', currentError);
    throw new AppError(500, 'PRODUCT_DELETE_FAILED', 'Could not load the product.');
  }
  const { error } = await supabase.rpc('delete_admin_product', {
    p_admin_id: req.user.id,
    p_product_id: id.data
  });
  if (error) throwRpcError(error, 'Product deletion');
  let imageCleanupPending = false;
  if (current?.image_path) {
    const { error: removeError } = await supabase.storage.from(config.SUPABASE_PRODUCT_IMAGES_BUCKET).remove([current.image_path]);
    if (removeError) {
      imageCleanupPending = true;
      console.error('Deleted product image cleanup failed:', removeError);
    }
  }
  res.json({ data: { deleted: true, image_cleanup_pending: imageCleanupPending } });
}));

router.get('/users', validate(userListSchema, 'query'), asyncHandler(async (req, res) => {
  const limit = req.validated.query.limit;
  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, phone, saldo_cents, role, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Admin user list failed:', error);
    throw new AppError(500, 'ADMIN_USERS_FAILED', 'Could not load user accounts.');
  }
  res.json({ data: { users: data } });
}));

export default router;
