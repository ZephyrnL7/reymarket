import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { requireSameOrigin } from '../middleware/security.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { z } from 'zod';

const router = Router();
router.post('/:productId', requireAuth, requireSameOrigin, asyncHandler(async (req, res) => {
  const productId = z.string().uuid().safeParse(req.params.productId);
  if (!productId.success) throw new AppError(400, 'INVALID_PRODUCT_ID', 'Product id is invalid.');
  const { data, error } = await supabase.rpc('purchase_product', {
    p_user_id: req.user.id,
    p_product_id: productId.data
  });
  if (error) {
    if (error.message.includes('product_unavailable')) throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'This product is no longer available.');
    if (error.message.includes('insufficient_balance')) throw new AppError(409, 'INSUFFICIENT_BALANCE', 'Your saldo is not enough for this purchase.');
    if (error.message.includes('user_not_found')) throw new AppError(404, 'USER_NOT_FOUND', 'Your account could not be found.');
    console.error('Atomic purchase failed:', error);
    throw new AppError(500, 'PURCHASE_FAILED', 'Could not complete this purchase.');
  }
  res.status(201).json({ data: { transaction: data } });
}));

export default router;
