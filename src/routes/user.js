import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { profileSchema } from '../schemas/index.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { requireSameOrigin } from '../middleware/security.js';

const router = Router();
router.use(requireAuth);

router.get('/profile', asyncHandler(async (req, res) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, email, phone, saldo_cents, role, created_at')
    .eq('id', req.user.id)
    .single();
  if (error) {
    console.error('Profile lookup failed:', error);
    throw new AppError(500, 'PROFILE_LOOKUP_FAILED', 'Could not load your profile.');
  }
  res.json({ data: { user } });
}));

router.patch('/profile', requireSameOrigin, validate(profileSchema), asyncHandler(async (req, res) => {
  const update = req.validated.body;
  if (update.username) update.username = update.username.toLowerCase();
  const { data: user, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', req.user.id)
    .select('id, username, email, phone, saldo_cents, role, created_at')
    .single();

  if (error?.code === '23505') throw new AppError(409, 'USERNAME_EXISTS', 'That username is already taken.');
  if (error) {
    console.error('Profile update failed:', error);
    throw new AppError(500, 'PROFILE_UPDATE_FAILED', 'Could not update your profile.');
  }
  res.json({ data: { user } });
}));

router.get('/transactions', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, order_id, type, product_name_snapshot, amount_cents, status, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('Transaction lookup failed:', error);
    throw new AppError(500, 'TRANSACTIONS_FAILED', 'Could not load your transactions.');
  }
  res.json({ data: { transactions: data } });
}));

router.get('/deposit-requests', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('deposit_requests')
    .select('id, reference_code, amount_cents, method, status, admin_note, created_at, reviewed_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('Deposit history lookup failed:', error);
    throw new AppError(500, 'DEPOSIT_HISTORY_FAILED', 'Could not load your deposit requests.');
  }
  res.json({ data: { requests: data } });
}));

router.get('/notifications', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, message, read_at, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) {
    console.error('Notification lookup failed:', error);
    throw new AppError(500, 'NOTIFICATIONS_FAILED', 'Could not load your notifications.');
  }
  res.json({ data: { notifications: data } });
}));

export default router;
