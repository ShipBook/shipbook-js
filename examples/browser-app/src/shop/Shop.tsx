import { useEffect, useRef, useState } from 'react';
import { Shipbook } from '@shipbook/browser';

const APP_ID = import.meta.env.VITE_SHIPBOOK_APP_ID || 'YOUR_APP_ID_HERE';
const APP_KEY = import.meta.env.VITE_SHIPBOOK_APP_KEY || 'YOUR_APP_KEY_HERE';
const SHIPBOOK_URL = import.meta.env.VITE_SHIPBOOK_URL;

interface CartItem {
  name: string;
  price: number;
}

// The app expects every order to come back with a shipping estimate
interface Order {
  orderId: number;
  shipping: { eta: string };
}

const CART: CartItem[] = [
  { name: 'Canvas backpack', price: 49 },
  { name: 'Water bottle', price: 18 },
  { name: 'Rain jacket', price: 79 },
];

const ADDRESS = { name: 'Sam Taylor', street: '12 Harbor Road', city: 'Portland' };

const log = Shipbook.getLogger('Checkout');

export default function Shop() {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean }>();
  const started = useRef(false);
  const total = CART.reduce((sum, item) => sum + item.price, 0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (SHIPBOOK_URL) Shipbook.setConnectionUrl(SHIPBOOK_URL);
    Shipbook.start(APP_ID, APP_KEY, { appVersion: '1.0.0' }).then(() => {
      Shipbook.registerUser('sam.taylor', 'sam', 'Sam Taylor', 'sam@example.com');
      Shipbook.screen('Cart');
      setReady(true);
    });
  }, []);

  const checkout = async () => {
    setMessage(undefined);
    log.i(`Checkout started: ${CART.length} items, total $${total}`);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...Shipbook.getSessionHeaders() },
        body: JSON.stringify({ items: CART, address: ADDRESS }),
      });
      const order: Order = await response.json();
      log.i(`Order ${order.orderId} placed (HTTP ${response.status})`);
      setMessage({ text: `Order placed! Arrives on ${order.shipping.eta}`, failed: false });
    } catch (e) {
      log.e('Checkout failed', e as Error);
      setMessage({ text: 'Something went wrong. Please try again.', failed: true });
    } finally {
      Shipbook.flush();
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '60px auto', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Harbor Supply</h1>
      <p style={{ color: '#6b7280', marginTop: 0 }}>Your cart</p>
      <div style={{ background: 'white', borderRadius: 12, padding: '8px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        {CART.map(item => (
          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span>{item.name}</span>
            <span>${item.price}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', fontWeight: 600 }}>
          <span>Total</span>
          <span>${total}</span>
        </div>
      </div>
      <p style={{ color: '#6b7280', fontSize: 14 }}>
        Ship to: {ADDRESS.name}, {ADDRESS.street}, {ADDRESS.city}
      </p>
      <button
        onClick={checkout}
        disabled={!ready}
        style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 600, border: 'none', borderRadius: 10, background: '#21a1b5', color: 'white', cursor: 'pointer' }}
      >
        Checkout
      </button>
      {message && (
        <p style={{ marginTop: 18, padding: 14, borderRadius: 10, background: message.failed ? '#fef2f2' : '#ecfdf5', color: message.failed ? '#b91c1c' : '#047857' }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
