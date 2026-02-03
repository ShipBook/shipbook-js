/**
 * Example: Express application with Shipbook per-request session tracking
 *
 * This example demonstrates:
 * - Per-request session tracking using express-session
 * - Automatic user context extraction
 * - TraceId extraction from headers
 * - Background job logging with runInContext()
 */

import express from 'express';
import session from 'express-session';
import Shipbook from '@shipbook/node';

// Replace with your actual credentials
const APP_ID = 'YOUR_APP_ID';
const APP_KEY = 'YOUR_APP_KEY';

const app = express();
app.use(express.json());

// Session middleware (required for session tracking)
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// Simulated auth middleware (populates req.user)
app.use((req, _res, next) => {
  // In a real app, this would come from your auth system
  if (req.headers.authorization) {
    (req as any).user = {
      id: 'user-123',
      name: 'John Doe',
      email: 'john@example.com'
    };
  }
  next();
});

// Shipbook middleware (after session and auth)
// This captures sessionId, user, and traceId for each request
app.use(Shipbook.expressMiddleware({
  // Optional: customize how user is extracted
  user: (req) => {
    const u = (req as any).user;
    if (!u) return undefined;
    return {
      userId: u.id,
      userName: u.name,
      email: u.email
    };
  },
  // Optional: customize session extraction
  session: (req) => (req as any).sessionID,
  // Optional: customize trace ID extraction
  trace: (req) => req.headers['x-request-id'] as string
}));

// Get logger (can be at module level)
const log = Shipbook.getLogger('ExpressExample');

// Routes
app.get('/api/users', async (req, res) => {
  // Logs automatically tagged with request's session + traceId
  log.i('Fetching users');

  try {
    // Simulate database call
    await new Promise(resolve => setTimeout(resolve, 100));
    const users = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ];

    log.d('Found users', { count: users.length });
    res.json(users);
  } catch (error) {
    log.e('Failed to fetch users', error as Error);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/users', async (req, res) => {
  log.i('Creating user', { email: req.body.email });

  try {
    // Simulate user creation
    await new Promise(resolve => setTimeout(resolve, 50));
    const user = { id: Date.now(), ...req.body };

    log.i('User created', { userId: user.id });
    res.status(201).json(user);
  } catch (error) {
    log.e('Failed to create user', error as Error);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/health', (req, res) => {
  log.d('Health check');
  res.json({ status: 'ok' });
});

// Background job simulation
async function runBackgroundJob() {
  // Wrap background jobs with runInContext for organized logging
  await Shipbook.runInContext({ jobId: 'cleanup-job' }, async () => {
    const jobLog = Shipbook.getLogger('CleanupJob');

    jobLog.i('Starting cleanup job');
    await new Promise(resolve => setTimeout(resolve, 100));
    jobLog.i('Cleanup job completed');
  });
}

async function startServer() {
  // Initialize Shipbook first
  console.log('Initializing Shipbook...');
  
  Shipbook.enableInnerLog(true);
  await Shipbook.start(APP_ID, APP_KEY);
  console.log('Shipbook initialized');

  const PORT = Number(process.env.PORT) || 3001;

  app.listen(PORT, () => {
    log.i(`Server started on port ${PORT}`);
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('\nTry these endpoints:');
    console.log(`  GET  http://localhost:${PORT}/api/users`);
    console.log(`  POST http://localhost:${PORT}/api/users`);
    console.log(`  GET  http://localhost:${PORT}/api/health`);
  });

  // Run background job periodically
  setInterval(runBackgroundJob, 60000);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await Shipbook.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await Shipbook.shutdown();
  process.exit(0);
});

// Start the server
startServer().catch(console.error);
