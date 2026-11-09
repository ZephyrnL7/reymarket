import { Router } from 'express';
import { config } from '../config/env.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    data: {
      tng_qr_image_url: config.TNG_QR_IMAGE_URL || null,
      maybank_account_name: config.MAYBANK_ACCOUNT_NAME || null,
      maybank_account_number: config.MAYBANK_ACCOUNT_NUMBER || null,
      tng_configured: Boolean(config.TNG_QR_IMAGE_URL),
      maybank_configured: Boolean(config.MAYBANK_ACCOUNT_NAME && config.MAYBANK_ACCOUNT_NUMBER)
    }
  });
});

export default router;
