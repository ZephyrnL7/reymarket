import app from './app.js';
import { config } from './config/env.js';
import { supabase } from './config/supabase.js';

async function expireDeposits() {
  const { data, error } = await supabase.rpc('expire_pending_deposits');
  if (error) {
    console.error('Pending deposit expiry job failed:', error);
    return;
  }
  if (data?.length) console.info(`Expired ${data.length} pending deposit request(s).`);
}

const server = app.listen(config.PORT, () => {
  console.info(`RikiMarket listening on port ${config.PORT}.`);
  void expireDeposits();
});

const expiryTimer = setInterval(() => void expireDeposits(), 15 * 60 * 1000);
expiryTimer.unref();

function shutdown() {
  clearInterval(expiryTimer);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
