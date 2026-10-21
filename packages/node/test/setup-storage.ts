import * as fs from 'fs';
import * as path from 'path';

// Each test file gets its own storage folder, so files running in parallel never share the machine udid or config.
process.env.SHIPBOOK_STORAGE_PATH = fs.mkdtempSync(path.join(process.env.SHIPBOOK_TEST_STORAGE_ROOT!, 'file-'));
