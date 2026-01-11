import Shipbook from '@shipbook/node';

// Replace with your actual credentials
const APP_ID = 'YOUR_APP_ID';
const APP_KEY = 'YOUR_APP_KEY';

async function main() {
  console.log('=== Shipbook Node.js Example ===\n');

  // Enable inner logging for debugging
  Shipbook.enableInnerLog(true);

  // Start Shipbook
  console.log('Initializing Shipbook...');
  try {
    await Shipbook.start(APP_ID, APP_KEY);
    console.log('✅ Shipbook initialized successfully\n');
  } catch (error) {
    console.error('❌ Failed to initialize Shipbook:', error);
    process.exit(1);
  }

  // Get a logger instance
  const log = Shipbook.getLogger('NodeExample');

  // Log at different severity levels
  console.log('Logging at different severity levels...\n');

  log.v('This is a verbose message');
  console.log('  📝 Logged: verbose');

  log.d('This is a debug message');
  console.log('  🔍 Logged: debug');

  log.i('This is an info message');
  console.log('  ℹ️  Logged: info');

  log.w('This is a warning message');
  console.log('  ⚠️  Logged: warning');

  log.e('This is an error message');
  console.log('  ❌ Logged: error');

  // Log with additional context
  log.i('User action: userId=123, action=login');
  console.log('  📊 Logged: info with context');

  // Log an exception
  console.log('\nLogging an exception...');
  try {
    throw new Error('Test exception from Node.js');
  } catch (error) {
    log.e('Caught exception', error as Error);
    console.log('  🐛 Logged: exception');
  }

  // Log a screen event
  Shipbook.screen('MainScreen');
  console.log('  📱 Logged: screen event');

  // Register a user
  console.log('\nRegistering user...');
  Shipbook.registerUser('user-123', 'testuser', 'Test User', 'test@example.com');
  console.log('  👤 User registered');

  // Flush logs
  console.log('\nFlushing logs...');
  Shipbook.flush();
  console.log('  ✅ Logs flushed');

  // Print UUID
  console.log(`\n📋 Session UUID: ${Shipbook.getUUID() || 'N/A'}`);

  console.log('\n=== Example completed ===');
  console.log('Replace APP_ID and APP_KEY with your Shipbook credentials.');

  // Give time for logs to be sent
  await new Promise(resolve => setTimeout(resolve, 2000));
}

main().catch(console.error);
