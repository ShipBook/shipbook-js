/**
 * Example: the backend of the session-linking demo (see examples/README.md)
 *
 * The browser shop (examples/browser-app/shop.html) sends its Shipbook session in the
 * x-shipbook-session header; the Express middleware picks it up, so this server's logs
 * appear in the same timeline as the app session that made the request.
 */

import 'dotenv/config';
import express from 'express';
import Shipbook from '@shipbook/node';

const APP_ID = process.env.SHIPBOOK_APP_ID || 'YOUR_APP_ID';
const APP_KEY = process.env.SHIPBOOK_APP_KEY || 'YOUR_APP_KEY';
const SHIPBOOK_URL = process.env.SHIPBOOK_URL;

interface CartItem {
  name: string;
  price: number;
}

interface Address {
  name: string;
  street: string;
  city: string;
  zip?: string;
}

const log = Shipbook.getLogger('Orders');
const app = express();
app.use(express.json());
app.use(Shipbook.expressMiddleware());

let nextOrderId = 1042;

async function estimateShipping(address: Address) {
  await new Promise(resolve => setTimeout(resolve, 120));
  if (!address.zip) throw new Error('shipping service: zip code is required');
  return { eta: 'Friday' };
}

app.post('/api/orders', async (req, res) => {
  const { items, address } = req.body as { items: CartItem[]; address: Address };
  const orderId = nextOrderId++;
  const total = items.reduce((sum, item) => sum + item.price, 0);
  log.i(`Order ${orderId} received: ${items.length} items, $${total}`);
  log.i(`Payment authorized for order ${orderId}`);

  let shipping = null;
  try {
    shipping = await estimateShipping(address);
  } catch (e) {
    // shipping is "optional", so a failed estimate shouldn't fail the order
    log.w(`No shipping estimate for order ${orderId}: ${(e as Error).message}`);
  }

  log.i(`Order ${orderId} saved`);
  res.json({ orderId, shipping });
});

async function startServer() {
  if (SHIPBOOK_URL) Shipbook.setConnectionUrl(SHIPBOOK_URL);
  await Shipbook.start(APP_ID, APP_KEY);

  const PORT = Number(process.env.PORT) || 3001;
  app.listen(PORT, () => console.log(`Shop backend running at http://localhost:${PORT}`));
}

process.on('SIGINT', async () => {
  await Shipbook.shutdown();
  process.exit(0);
});

startServer().catch(console.error);
