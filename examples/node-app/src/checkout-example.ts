/**
 * Example: the backend of the Claude connector demo (see examples/README.md)
 *
 * Release 2.4.0 moved currency conversion to a new FX feed that has no CAD rate, so every
 * Canadian order is charged NaN and declined. Run it as 2.3.0, then as 2.4.0, and ask
 * Claude (with the Shipbook connector) why payments are failing.
 */

import 'dotenv/config';
import express from 'express';
import Shipbook from '@shipbook/node';

const APP_ID = process.env.SHIPBOOK_APP_ID || 'YOUR_APP_ID';
const APP_KEY = process.env.SHIPBOOK_APP_KEY || 'YOUR_APP_KEY';
const SHIPBOOK_URL = process.env.SHIPBOOK_URL;
const APP_VERSION = process.env.APP_VERSION || '2.4.0';

enum Currency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  CAD = 'CAD',
}

interface Payment {
  customer: { id: string; name: string; email: string };
  currency: Currency;
  total: number;
}

const BANK_RATES: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, CAD: 0.72 };
const FX_FEED_RATES: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27 };
const rates = APP_VERSION === '2.3.0' ? BANK_RATES : FX_FEED_RATES;

const log = Shipbook.getLogger('Payments');
const app = express();
app.use(express.json());
app.use(
  Shipbook.expressMiddleware({
    user: req => {
      const { customer } = req.body as Payment;
      return customer && { userId: customer.id, fullName: customer.name, email: customer.email };
    },
  }),
);

let nextOrderId = 7310;

async function charge(orderId: number, amountUsd: number) {
  await new Promise(resolve => setTimeout(resolve, 80));
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error(`card processor declined order ${orderId}: invalid amount ${amountUsd}`);
  }
  return `ch_${orderId}`;
}

app.post('/api/payments', async (req, res) => {
  const { currency, total } = req.body as Payment;
  const orderId = nextOrderId++;
  log.i(`Order ${orderId}: charging ${total} ${currency}`);

  const rate = rates[currency];
  const amountUsd = Math.round(total * rate * 100) / 100;
  log.d(`Order ${orderId}: rate ${currency}->USD = ${rate}, amount $${amountUsd}`);

  try {
    const chargeId = await charge(orderId, amountUsd);
    log.i(`Order ${orderId} paid (${chargeId})`);
    res.json({ orderId, status: 'paid' });
  } catch (e) {
    log.e(`Payment failed for order ${orderId}`, e as Error);
    res.status(402).json({ orderId, status: 'failed' });
  }
});

async function startServer() {
  if (SHIPBOOK_URL) Shipbook.setConnectionUrl(SHIPBOOK_URL);
  await Shipbook.start(APP_ID, APP_KEY, APP_VERSION);

  const PORT = Number(process.env.PORT) || 3001;
  app.listen(PORT, () => console.log(`Checkout API ${APP_VERSION} running at http://localhost:${PORT}`));
}

process.on('SIGINT', async () => {
  await Shipbook.shutdown();
  process.exit(0);
});

startServer().catch(console.error);
