import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { asyncHandler } from '../utils/errors.js';
import { login, logout, refreshToken, register } from '../controllers/auth.js';
import { loginSchema, registerSchema } from '../schemas/index.js';
import { requireSameOrigin } from '../middleware/security.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } }
});

router.post('/register', requireSameOrigin, authRateLimit, validate(registerSchema), asyncHandler(register));
router.post('/login', requireSameOrigin, authRateLimit, validate(loginSchema), asyncHandler(login));
router.post('/refresh-token', requireSameOrigin, asyncHandler(refreshToken));
router.post('/logout', requireSameOrigin, asyncHandler(logout));

export default router;
