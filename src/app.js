import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/env.js';
import { errorHandler } from './middleware/security.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import depositRoutes from './routes/deposits.js';
import paymentInstructionsRoutes from './routes/payment-instructions.js';
import productRoutes from './routes/products.js';
import purchaseRoutes from './routes/purchases.js';
import userRoutes from './routes/user.js';

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '..');
const designFiles = new Set([
  'style.css',
  'responsive-fullwidth.css',
  'products-modern.css',
  'confirm-sheet.css'
]);

app.set('trust proxy', config.NODE_ENV === 'production' ? 1 : false);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https:']
    }
  }
}));
app.use(express.json({ limit: '30kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/design/:file', (req, res, next) => {
  if (!designFiles.has(req.params.file)) return next();
  res.sendFile(path.join(projectRoot, 'rikimarket_clean_source', req.params.file));
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/payment-instructions', paymentInstructionsRoutes);
app.use('/api/deposit-request', depositRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(path.join(projectRoot, 'public'), {
  index: 'index.html',
  etag: true,
  maxAge: config.NODE_ENV === 'production' ? '1h' : 0
}));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route was not found.' } });
});
app.use((_req, res) => res.status(404).send('Page not found.'));
app.use(errorHandler);

export default app;
