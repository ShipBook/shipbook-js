import type { ConfigResponse } from '@shipbook/core';
import { logManager } from '@shipbook/core';
import { Shipbook } from '../src/index';
import { authManager } from '../src/auth/auth-manager';
import { storage } from '../src/adapters/storage';

const configOf = (maxTime: number): ConfigResponse => ({
  appenders: [{ type: 'SBCloudAppender', name: 'cloud', config: { maxTime } }],
  loggers: [{ name: '', severity: 'Verbose', appenderRef: 'cloud' }]
});

describe('cached config', () => {
  let applied: ConfigResponse[];

  beforeEach(() => {
    applied = [];
    jest.spyOn(logManager, 'config').mockImplementation(conf => { applied.push(conf); });
    jest.spyOn(authManager, 'login').mockResolvedValue({ token: 'token', config: configOf(7) });
  });

  afterEach(async () => {
    await Shipbook.shutdown();
    jest.restoreAllMocks();
    for (const app of ['app-a', 'app-b', 'app-c']) await storage.removeItem(`config_${app}`);
  });

  it("caches the server config under the app's own key", async () => {
    await Shipbook.start('app-a', 'key');

    expect(await storage.getObj('config_app-a')).toEqual(configOf(7));
  });

  it("starts from its own cached config, not another app's on the same machine", async () => {
    await storage.setObj('config_app-b', configOf(5));
    await storage.setObj('config_app-c', configOf(9));

    await Shipbook.start('app-b', 'key');

    expect(applied[0]).toEqual(configOf(5));
  });
});
