import { Log, appenderFactory, logManager, InnerLog, connectionClient, HttpMethod, Message } from '@shipbook/core';
import type { ConfigResponse } from '@shipbook/core';
import { storage } from './adapters';
import { createExpressMiddleware } from './middleware/express';
import { createNestInterceptor } from './middleware/nestjs';
import { SBCloudAppender } from './appender/sbcloud-appender';
import { authManager } from './auth/auth-manager';
import { requestContext } from './context/request-context';

const DEFAULT_CONFIG_REFRESH_INTERVAL = 300; // 5 minutes in seconds

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

  async start(appId: string, appKey: string, appVersion?: string): Promise<string | undefined> {
    // Set deps and register class so the factory can create it during config()
    SBCloudAppender.setDeps({ appVersion, getToken: () => authManager.getToken() });
    appenderFactory.register('SBCloudAppender', SBCloudAppender);

    connectionClient.setDeps({
      getToken: () => authManager.getToken(),
      refreshToken: async () => {
        const result = await authManager.login(appId, appKey);
        if (!result) return false;
        logManager.config(result.config);
        storage.setObj('config', result.config);
        return true;
      }
    });

    // Load persisted config
    let config = await storage.getObj<ConfigResponse>('config');
    if (!config) config = defaultConfig;
    logManager.config(config);

    // Auth via loginSdkServer (server-specific, with proactive token refresh)
    const result = await authManager.login(appId, appKey);
    if (!result) {
      InnerLog.w('Auth failed - logs will be buffered until auth succeeds');
      return undefined;
    }

    // Apply and persist server config
    logManager.config(result.config);
    storage.setObj('config', result.config);
    this.scheduleConfigRefresh(result.config.configRefreshInterval);

    return undefined;
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
      storage.setObj('config', newConfig);

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

  flush(): void {
    logManager.flush();
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

  // For background jobs - wrap code to get organized session grouping
  runInContext<T>(
    options: { jobName: string; metadata?: Record<string, unknown> },
    fn: () => T | Promise<T>
  ): T | Promise<T> {
    return requestContext.runJob(options, fn);
  }

  // Access to request context (for advanced use)
  get context() {
    return requestContext;
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    if (this.configRefreshTimer) {
      clearTimeout(this.configRefreshTimer);
    }
    logManager.flush();
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
  type User,
  type IStorage,
  type IPlatform,
  type IEventManager,
  type IExceptionHandler,
  type PlatformAdapters,
  type RequestContext
} from '@shipbook/core';
