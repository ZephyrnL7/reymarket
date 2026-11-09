import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { config } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import {
  clearAuthCookies,
  hashRefreshToken,
  issueAuthSession,
  refreshCookieName,
  signAccessToken
} from '../utils/auth.js';

export async function register(req, res) {
  const { username, email, password } = req.validated.body;
  const passwordHash = await bcrypt.hash(password, 12);
  const { data: user, error } = await supabase
    .from('users')
    .insert({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password_hash: passwordHash
    })
    .select('id, username, email, role, saldo_cents, created_at')
    .single();

  if (error?.code === '23505') throw new AppError(409, 'ACCOUNT_EXISTS', 'That username or email is already registered.');
  if (error) {
    console.error('Registration failed:', error);
    throw new AppError(500, 'REGISTER_FAILED', 'Could not create your account.');
  }

  await issueAuthSession(user, res);
  res.status(201).json({ data: { user } });
}

export async function login(req, res) {
  const { identifier, password } = req.validated.body;
  const normalized = identifier.toLowerCase();
  const field = normalized.includes('@') ? 'email' : 'username';
  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, email, password_hash, role, saldo_cents, created_at')
    .eq(field, normalized)
    .maybeSingle();

  if (error) {
    console.error('Login lookup failed:', error);
    throw new AppError(500, 'LOGIN_FAILED', 'Could not sign in at this time.');
  }
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Username/email or password is incorrect.');
  }

  const { password_hash: _passwordHash, ...safeUser } = user;
  await issueAuthSession(safeUser, res);
  res.json({ data: { user: safeUser } });
}

export async function refreshToken(req, res) {
  const currentToken = req.cookies?.[refreshCookieName];
  if (!currentToken) {
    clearAuthCookies(res);
    throw new AppError(401, 'REFRESH_REQUIRED', 'Please sign in again.');
  }

  const nextToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: sessionRows, error } = await supabase.rpc('rotate_refresh_session', {
    p_token_hash: hashRefreshToken(currentToken),
    p_new_token_hash: hashRefreshToken(nextToken),
    p_expires_at: expiresAt
  });

  if (error) {
    console.error('Refresh token rotation failed:', error);
    throw new AppError(500, 'REFRESH_FAILED', 'Could not refresh your session.');
  }
  const sessionUser = sessionRows?.[0];
  if (!sessionUser) {
    clearAuthCookies(res);
    throw new AppError(401, 'REFRESH_EXPIRED', 'Your session has expired. Please sign in again.');
  }

  const user = {
    id: sessionUser.user_id,
    username: sessionUser.username,
    email: sessionUser.email,
    role: sessionUser.role,
    saldo_cents: sessionUser.saldo_cents,
    created_at: sessionUser.created_at
  };
  res.cookie('rm_access', signAccessToken(user), {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: 20 * 60 * 1000
  });
  res.cookie(refreshCookieName, nextToken, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: config.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
  });
  res.json({ data: { user } });
}

export async function logout(req, res) {
  const token = req.cookies?.[refreshCookieName];
  if (token) {
    const { error } = await supabase.rpc('revoke_refresh_session', { p_token_hash: hashRefreshToken(token) });
    if (error) {
      console.error('Refresh token revocation failed:', error);
      throw new AppError(500, 'LOGOUT_FAILED', 'Could not end your session securely.');
    }
  }
  clearAuthCookies(res);
  res.json({ data: { logged_out: true } });
}
