import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// One root per run for the per-file storage folders (setup-storage.ts); globalTeardown removes it.
export default function globalSetup() {
  process.env.SHIPBOOK_TEST_STORAGE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'shipbook-test-'));
}
