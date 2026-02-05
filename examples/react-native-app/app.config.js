// Load environment variables for local development
// Create a .env file based on .env.example with your Shipbook credentials
import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  extra: {
    shipbookAppId: process.env.SHIPBOOK_APP_ID || 'YOUR_APP_ID_HERE',
    shipbookAppKey: process.env.SHIPBOOK_APP_KEY || 'YOUR_APP_KEY_HERE',
    shipbookUrl: process.env.SHIPBOOK_URL,
  },
});
