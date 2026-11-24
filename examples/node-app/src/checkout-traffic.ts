/**
 * Sends a stream of payments from made-up customers in four currencies to the checkout example,
 * so its release health and errors look like a real day of traffic.
 * Usage: npm run checkout:traffic -- [payments=60]
 */

const API = process.env.CHECKOUT_API || 'http://localhost:3001';
const count = Number(process.argv[2]) || 60;

const CUSTOMERS = [
  { id: 'u-1041', name: 'Olivia Martin', email: 'olivia@example.com', currency: 'CAD' },
  { id: 'u-1187', name: 'Liam Chen', email: 'liam@example.com', currency: 'USD' },
  { id: 'u-1203', name: 'Emma Schmidt', email: 'emma@example.com', currency: 'EUR' },
  { id: 'u-1265', name: 'Noah Tremblay', email: 'noah@example.com', currency: 'CAD' },
  { id: 'u-1302', name: 'Ava Johnson', email: 'ava@example.com', currency: 'USD' },
  { id: 'u-1348', name: 'Oliver Brown', email: 'oliver@example.com', currency: 'GBP' },
  { id: 'u-1391', name: 'Sophie Roy', email: 'sophie@example.com', currency: 'CAD' },
  { id: 'u-1420', name: 'Lucas Rossi', email: 'lucas@example.com', currency: 'EUR' },
  { id: 'u-1477', name: 'Mia Davis', email: 'mia@example.com', currency: 'USD' },
  { id: 'u-1509', name: 'Jack Wilson', email: 'jack@example.com', currency: 'GBP' },
];

async function run() {
  const results: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    const { currency, ...customer } = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
    const total = Math.round((20 + Math.random() * 180) * 100) / 100;
    const response = await fetch(`${API}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer, currency, total }),
    });
    const key = `${currency} ${response.status}`;
    results[key] = (results[key] ?? 0) + 1;
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 600));
  }
  console.log(results);
}

run().catch(console.error);
