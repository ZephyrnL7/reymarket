import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { validate } from '../middleware/validate.js';
import { AppError, asyncHandler } from '../utils/errors.js';

const router = Router();
const categorySchema = z.object({
  category: z.enum(['panel_hosting', 'script_bot', 'vps', 'game_topup', 'subdomain', 'premium_app']).optional()
});

router.get('/', validate(categorySchema, 'query'), asyncHandler(async (req, res) => {
  let query = supabase
    .from('products')
    .select('id, category, name, description, price_cents, stock, status, image_url, created_at')
    .eq('status', 'available')
    .gt('stock', 0)
    .order('created_at', { ascending: false });
  if (req.validated.query.category) query = query.eq('category', req.validated.query.category);

  const { data, error } = await query;
  if (error) {
    console.error('Product listing failed:', error);
    throw new AppError(500, 'PRODUCTS_FAILED', 'Could not load products.');
  }
  res.json({ data: { products: data } });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new AppError(400, 'INVALID_PRODUCT_ID', 'Product id is invalid.');
  const { data, error } = await supabase
    .from('products')
    .select('id, category, name, description, price_cents, stock, status, image_url, created_at')
    .eq('id', id.data)
    .eq('status', 'available')
    .gt('stock', 0)
    .maybeSingle();
  if (error) {
    console.error('Product lookup failed:', error);
    throw new AppError(500, 'PRODUCT_LOOKUP_FAILED', 'Could not load this product.');
  }
  if (!data) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found.');
  res.json({ data: { product: data } });
}));

export default router;
