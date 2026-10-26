import { Log, appenderFactory, logManager, InnerLog, connectionClient, HttpMethod, Message, Exception, RequestKind } from '@shipbook/core';
import type { ConfigResponse } from '@shipbook/core';
import * as fs from 'fs';
import * as path from 'path';
import { storage, exceptionHandler, eventManager } from './adapters';
import { createExpressMiddleware } from './middleware/express';
import { createNestInterceptor } from './middleware/nestjs';
import { SBCloudAppender } from './appender/sbcloud-appender';
import { authManager } from './auth/auth-manager';
import { requestContext } from './context/request-context';
import type { JobContextOptions } from './context/request-context';
import { runInRequest } from './middleware/request-events';
import { instrumentMcpTransport } from './mcp/mcp-transport';

const DEFAULT_CONFIG_REFRESH_INTERVAL = 300; // 5 minutes in seconds

// Until the cached or server config is applied, as on mobile: the cloud accumulates (info waits for a warning).
const defaultConfig: ConfigResponse = {
  appenders: [
    { type: 'ConsoleAppender', name: 'console', config: { pattern: '$message' } },
    { type: 'SBCloudAppender', name: 'cloud', config: { maxTime: 3, flushSeverity: 'Warning' } }
  ],
  loggers: [
    { name: '', severity: 'Verbose', appenderRef: 'console' },
    { name: '', severity: 'Verbose', appenderRef: 'cloud' }
  ]
};

class ShipbookNode {
  private configRefreshTimer?: ReturnType<typeof setTimeout>;
  private configRefreshInterval = DEFAULT_CONFIG_REFRESH_INTERVAL;
  private unsubscribeBackground?: () => void;
  // Per app: apps on one machine share the storage folder, and one must not start with another's config.
  private configKey!: string;

  async start(appId: string, appKey: string, appVersion?: string): Promise<string | undefined> {
    // Set before config() makes the cloud appender, which reads it
    authManager.appVersion = appVersion ?? this.detectAppVersion();
    appenderFactory.register('SBCloudAppender', SBCloudAppender);
    // Applied at once, as mobile applies its config before anything async, so startup logs don't miss the cloud while the cache is read.
    logManager.config(defaultConfig);
    this.configKey = `config_${appId}`;
    exceptionHandler.start((name, message, stack) => {
      logManager.push(new Exception(name, message, stack ?? ''));
      return logManager.flush();
    });
    this.unsubscribeBackground ??= eventManager.onBackground(() => logManager.flush());

    connectionClient.setDeps({
      getToken: () => authManager.getToken(),
      refreshToken: async () => {
        const result = await authManager.login(appId, appKey);
        if (!result) return false;
        logManager.config(result.config);
        storage.setObj(this.configKey, result.config);
        return true;
      }
    });

    // Load persisted config
    const cached = await storage.getObj<ConfigResponse>(this.configKey);
    if (cached) logManager.config(cached);

    // Auth via loginSdkServer (server-specific, with proactive token refresh)
    const result = await authManager.login(appId, appKey);
    if (!result) {
      InnerLog.w('Auth failed - logs will be buffered until auth succeeds');
      return undefined;
    }

    // Apply and persist server config
    logManager.config(result.config);
    storage.setObj(this.configKey, result.config);
    this.scheduleConfigRefresh(result.config.configRefreshInterval);

    return undefined;
  }

  // Nearest package.json wins — walking past one without a version would grab an unrelated manifest
  private detectAppVersion(): string | undefined {
    let dir = process.cwd();
    for (;;) {
      const file = path.join(dir, 'package.json');
      if (fs.existsSync(file)) {
        try {
          return (JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: string }).version;
        } catch {
          return undefined;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) return undefined;
      dir = parent;
    }
  }

  private scheduleConfigRefresh(intervalSeconds?: number): void {
    this.configRefreshInterval = intervalSeconds ?? this.configRefreshInterval;
    if (this.configRefreshTimer) {
      clearTimeout(this.configRefreshTimer);
    }
    this.configRefreshTimer = setTimeout(() => this.refreshConfig(), this.configRefreshInterval * 1000);
  }

  private async refreshConfig(): Promise<void> {
    try {
      const response = await connectionClient.request('auth/configSdkServer', undefined, HttpMethod.GET);
      if (!response.ok) {
        InnerLog.e('Config refresh failed:', response.status);
        this.scheduleConfigRefresh();
        return;
      }

      const newConfig: ConfigResponse = await response.json();
      logManager.config(newConfig);
      storage.setObj(this.configKey, newConfig);

      this.scheduleConfigRefresh(newConfig.configRefreshInterval);
    } catch (error) {
      InnerLog.e('Config refresh error:', error);
      this.scheduleConfigRefresh();
    }
  }

  getLogger(tag: string): Log {
    return new Log(tag);
  }

  enableInnerLog(enable: boolean): void {
    InnerLog.enabled = enable;
  }

  setConnectionUrl(url: string): void {
    connectionClient.BASE_URL = url.endsWith('/') ? url : url + '/';
  }

  flush(): Promise<void> {
    return logManager.flush();
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  addWrapperClass(cls: Function | string): void {
    const name = typeof cls === 'string' ? cls : cls.name;
    Message.ignoreClasses.add(name);
  }

  setStackOffset(offset: number): void {
    Message.stackOffset = offset;
  }

  // Express middleware factory
  expressMiddleware = createExpressMiddleware;

  // NestJS interceptor factory
  nestjsInterceptor = createNestInterceptor;

  // A background job's run: its own session, and one request of kind Job in it, so it counts and ends like a request
  runInContext<T>(options: JobContextOptions, fn: () => T | Promise<T>): Promise<T> {
    return requestContext.runJob(options, () => runInRequest(RequestKind.Job, options.jobName, fn));
  }

  // Work that isn't an HTTP request (a queue message, a WebSocket message) read as one request of the current session
  runInRequest = runInRequest;

  // Wrap an MCP server's transport (stdio, WebSocket, …): server.connect(Shipbook.mcpTransport(new StdioServerTransport()))
  mcpTransport = instrumentMcpTransport;

  // Access to request context (for advanced use)
  get context() {
    return requestContext;
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    if (this.configRefreshTimer) {
      clearTimeout(this.configRefreshTimer);
    }
    exceptionHandler.stop();
    this.unsubscribeBackground?.();
    this.unsubscribeBackground = undefined;
    await logManager.flush();
    authManager.destroy();
  }
}

const Shipbook = new ShipbookNode();
export default Shipbook;
export { Shipbook };

// Re-export types from core
export {
  Log,
  Severity,
  SeverityUtil,
  RequestKind,
  type User,
  type IStorage,
  type IPlatform,
  type IEventManager,
  type IExceptionHandler,
  type PlatformAdapters,
  type RequestContext
} from '@shipbook/core';
