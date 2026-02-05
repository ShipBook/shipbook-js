/**
 * Example: Node.js standalone application with background job tracking
 *
 * This example demonstrates:
 * - Basic logging without Express
 * - Background job logging with runInContext()
 * - Daily background sessions for non-request logs
 */

import 'dotenv/config';
import Shipbook from '@shipbook/node';

// Load credentials from environment variables (see .env.example)
const APP_ID = process.env.SHIPBOOK_APP_ID || 'YOUR_APP_ID';
const APP_KEY = process.env.SHIPBOOK_APP_KEY || 'YOUR_APP_KEY';
const SHIPBOOK_URL = process.env.SHIPBOOK_URL;

const log = Shipbook.getLogger('BackgroundJobExample');

// Simulated email queue processor
async function processEmailQueue() {
  // Wrap the job for organized logging
  await Shipbook.runInContext({ jobId: 'email-queue' }, async () => {
    const emailLog = Shipbook.getLogger('EmailProcessor');

    emailLog.i('Processing email queue');

    // Simulate processing emails
    const emails = [
      { id: 1, to: 'user1@example.com', subject: 'Welcome' },
      { id: 2, to: 'user2@example.com', subject: 'Newsletter' },
      { id: 3, to: 'user3@example.com', subject: 'Alert' }
    ];

    for (const email of emails) {
      emailLog.d(`Sending email to ${email.to}`);
      await new Promise(resolve => setTimeout(resolve, 100));
      emailLog.i(`Email sent: ${email.subject}`, { emailId: email.id });
    }

    emailLog.i('Email queue processed', { count: emails.length });
  });
}

// Simulated data cleanup job
async function runDataCleanup() {
  await Shipbook.runInContext(
    { jobId: 'data-cleanup', metadata: { priority: 'low' } },
    async () => {
      const cleanupLog = Shipbook.getLogger('DataCleanup');

      cleanupLog.i('Starting data cleanup');

      // Simulate cleanup operations
      const deletedRecords = Math.floor(Math.random() * 100);
      await new Promise(resolve => setTimeout(resolve, 200));

      cleanupLog.i('Data cleanup completed', { deletedRecords });
    }
  );
}

// Simulated report generation
async function generateDailyReport() {
  await Shipbook.runInContext({ jobId: 'daily-report' }, async () => {
    const reportLog = Shipbook.getLogger('ReportGenerator');

    reportLog.i('Generating daily report');

    try {
      // Simulate report generation
      await new Promise(resolve => setTimeout(resolve, 300));
      reportLog.i('Daily report generated successfully');
    } catch (error) {
      reportLog.e('Failed to generate daily report', error as Error);
    }
  });
}

async function main() {
  console.log('=== Background Job Example ===\n');

  // Initialize Shipbook
  console.log('Initializing Shipbook...');

  Shipbook.enableInnerLog(true);

  // Set custom URL if provided
  if (SHIPBOOK_URL) {
    Shipbook.setConnectionUrl(SHIPBOOK_URL);
  }

  await Shipbook.start(APP_ID, APP_KEY);
  console.log('Shipbook initialized\n');

  // Startup logs go to daily background session
  log.i('Application started');
  log.d('Configuration loaded');

  // Run some background jobs
  console.log('Running background jobs...\n');

  // These will each have their own session (job_email-queue, job_data-cleanup, etc.)
  await processEmailQueue();
  console.log('  ✓ Email queue processed');

  await runDataCleanup();
  console.log('  ✓ Data cleanup completed');

  await generateDailyReport();
  console.log('  ✓ Daily report generated');

  // More startup logs - still go to daily background session
  log.i('All background jobs completed');

  // Flush and shutdown
  console.log('\nFlushing logs...');
  await Shipbook.shutdown();

  console.log('\n=== Example completed ===');
  console.log('Check your Shipbook dashboard to see the logs grouped by session:');
  console.log('  - background_YYYY-MM-DD: Startup and general logs');
  console.log('  - job_email-queue: Email processing logs');
  console.log('  - job_data-cleanup: Data cleanup logs');
  console.log('  - job_daily-report: Report generation logs');
}

main().catch(console.error);
