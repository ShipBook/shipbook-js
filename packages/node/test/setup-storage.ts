import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Each test file gets its own storage folder, so files running in parallel never share the machine udid or config.
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'shipbook-test-'));
process.env.SHIPBOOK_STORAGE_PATH = folder;
process.on('exit', () => fs.rmSync(folder, { recursive: true, force: true }));
