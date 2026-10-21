import type { ConfigResponse, RequestContext } from '@shipbook/core';
import { logManager, Message, Severity } from '@shipbook/core';
import { Shipbook } from '../src/index';
import { authManager } from '../src/auth/auth-manager';
import { storage } from '../src/adapters/storage';
import { requestContext } from '../src/context/request-context';
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

describe('before the first server config', () => {
  const warningOnly: ConfigResponse = {
    appenders: [{ type: 'SBCloudAppender', name: 'cloud', config: { maxTime: 3 } }],
    loggers: [{ name: '', severity: 'Warning', appenderRef: 'cloud' }]
  };
  let finishLogin: (result: { token: string, config: ConfigResponse }) => void;
  let sent: { log: string, ctx?: RequestContext }[];
  let sessions: RequestContext[];

  beforeEach(() => {
    sent = [];
    sessions = [];
    jest.spyOn(authManager, 'login').mockReturnValue(new Promise(resolve => { finishLogin = resolve; }));
    jest.spyOn(SBCloudAppender.prototype, 'push').mockImplementation(log => { sent.push({ log: (log as Message).message, ctx: requestContext.get() }); });
    jest.spyOn(SBCloudAppender.prototype, 'ensureSession').mockImplementation(ctx => { sessions.push(ctx); });
  });

  afterEach(async () => {
    await Shipbook.shutdown();
    jest.restoreAllMocks();
    await storage.removeItem('config_app-startup');
  });

  it("holds what's logged until login, then lets the server config filter it, each in its own request", async () => {
    const starting = Shipbook.start('app-startup', 'key');
    const ctx: RequestContext = { sessionId: 'session-1', requestId: 'request-1', startTime: new Date(), isBackground: false };
    requestContext.enter(ctx, () => {
      logManager.ensureSession(ctx);
      logManager.push(new Message('debug at startup', Severity.Debug, 'Tag'));
      logManager.push(new Message('warning at startup', Severity.Warning, 'Tag'));
    });
    expect(sent).toEqual([]);

    finishLogin({ token: 'token', config: warningOnly });
    await starting;

    expect(sent).toEqual([{ log: 'warning at startup', ctx }]);
    expect(sessions).toEqual([ctx]);
  });
});

