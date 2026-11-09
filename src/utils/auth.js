import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { AppError } from './errors.js';

export const accessCookieName = 'rm_access';
export const refreshCookieName = 'rm_refresh';
export const refreshCookiePath = '/api/auth';

export function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(user) {
  return jwt.sign({ role: user.role }, config.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: config.JWT_ACCESS_TTL,
    issuer: 'rikimarket',
    audience: 'rikimarket-web'
  });
}

function cookieOptions(path) {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path
  };
}

export function clearAuthCookies(res) {
  res.clearCookie(accessCookieName, cookieOptions('/api'));
  res.clearCookie(refreshCookieName, cookieOptions(refreshCookiePath));
}

export async function issueAuthSession(user, res) {
  const refreshToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.rpc('create_refresh_session', {
    p_user_id: user.id,
    p_token_hash: hashRefreshToken(refreshToken),
    p_expires_at: expiresAt
  });
  if (error) {
    console.error('Refresh session creation failed:', error);
    throw new AppError(500, 'SESSION_CREATE_FAILED', 'Could not create a secure session.');
  }

  res.cookie(accessCookieName, signAccessToken(user), {
    ...cookieOptions('/api'),
    maxAge: 20 * 60 * 1000
  });
  res.cookie(refreshCookieName, refreshToken, {
    ...cookieOptions(refreshCookiePath),
    maxAge: config.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
  });
}
