import { useState } from 'react';

interface CartItem {
  name: string;
  price: number;
}

const CART: CartItem[] = [
  { name: 'Wool toque', price: 34 },
  { name: 'Trail mittens', price: 52 },
  { name: 'Down vest', price: 149 },
];

const CUSTOMER = { id: 'u-1041', name: 'Olivia Martin', email: 'olivia@example.com' };

export default function Checkout() {
  const [message, setMessage] = useState<{ text: string; failed: boolean }>();
  const [paying, setPaying] = useState(false);
  const total = CART.reduce((sum, item) => sum + item.price, 0);

  const pay = async () => {
    setMessage(undefined);
    setPaying(true);
    const response = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer: CUSTOMER, currency: 'CAD', total }),
    });
    setPaying(false);
    setMessage(
      response.ok
        ? { text: 'Payment received. Thank you!', failed: false }
        : { text: 'Payment failed. Please try again.', failed: true },
    );
  };

  return (
    <div style={{ maxWidth: 420, margin: '60px auto', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Maple Outfitters</h1>
      <p style={{ color: '#6b7280', marginTop: 0 }}>Your cart</p>
      <div style={{ background: 'white', borderRadius: 12, padding: '8px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        {CART.map(item => (
          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span>{item.name}</span>
            <span>CA${item.price}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', fontWeight: 600 }}>
          <span>Total</span>
          <span>CA${total}</span>
        </div>
      </div>
      <p style={{ color: '#6b7280', fontSize: 14 }}>
        Card: Visa •••• 4242 · {CUSTOMER.name}, Toronto
      </p>
      <button
        onClick={pay}
        disabled={paying}
        style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 600, border: 'none', borderRadius: 10, background: '#21a1b5', color: 'white', cursor: 'pointer' }}
      >
        {paying ? 'Paying…' : `Pay CA$${total}`}
      </button>
      {message && (
        <p style={{ marginTop: 18, padding: 14, borderRadius: 10, background: message.failed ? '#fef2f2' : '#ecfdf5', color: message.failed ? '#b91c1c' : '#047857' }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
