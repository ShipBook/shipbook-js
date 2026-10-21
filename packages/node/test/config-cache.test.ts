import type { ConfigResponse } from '@shipbook/core';
import { logManager, Message, Severity } from '@shipbook/core';
import { Shipbook } from '../src/index';
import { authManager } from '../src/auth/auth-manager';
import { storage } from '../src/adapters/storage';
import { SBCloudAppender } from '../src/appender/sbcloud-appender';

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

    expect(applied[1]).toEqual(configOf(5)); // after the startup config
  });
});

describe('before the cached or server config', () => {
  let sent: string[];

  beforeEach(() => {
    sent = [];
    jest.spyOn(authManager, 'login').mockResolvedValue(undefined);
    jest.spyOn(SBCloudAppender.prototype, 'push').mockImplementation(log => { sent.push((log as Message).message); });
  });

  afterEach(async () => {
    await Shipbook.shutdown();
    jest.restoreAllMocks();
  });

  it('sends a log written right after start() to the cloud appender, as mobile applies its config at once', async () => {
    const starting = Shipbook.start('app-startup', 'key');
    logManager.push(new Message('logged at startup', Severity.Info, 'Tag'));
    await starting;

    expect(sent).toEqual(['logged at startup']);
  });
});
