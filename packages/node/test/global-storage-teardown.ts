import * as fs from 'fs';

export default function globalTeardown() {
  fs.rmSync(process.env.SHIPBOOK_TEST_STORAGE_ROOT!, { recursive: true, force: true });
}
