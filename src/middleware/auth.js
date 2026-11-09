import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/errors.js';

export async function requireAuth(req, _res, next) {
  try {
    const token = req.cookies?.rm_access;
    if (!token) throw new AppError(401, 'AUTH_REQUIRED', 'Please sign in to continue.');

    const claims = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      issuer: 'rikimarket',
      audience: 'rikimarket-web',
      algorithms: ['HS256']
    });
    if (typeof claims === 'string' || typeof claims.sub !== 'string') {
      throw new AppError(401, 'INVALID_SESSION', 'Your session is invalid. Please sign in again.');
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, role')
      .eq('id', claims.sub)
      .maybeSingle();
    if (error) throw error;
    if (!user) throw new AppError(401, 'INVALID_SESSION', 'Your account is unavailable.');

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    if (error?.name === 'TokenExpiredError' || error?.name === 'JsonWebTokenError') {
      return next(new AppError(401, 'SESSION_EXPIRED', 'Your session has expired.'));
    }
    console.error('Authentication lookup failed:', error);
    next(new AppError(500, 'AUTH_ERROR', 'Could not verify your session.'));
  }
}

export async function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') {
    return next(new AppError(403, 'ADMIN_REQUIRED', 'Administrator access is required.'));
  }
  next();
}
