import { Log, appenderFactory, logManager, InnerLog, connectionClient, Message } from '@shipbook/core';
import type { ConfigResponse } from '@shipbook/core';
import { storage } from './adapters';
import { createExpressMiddleware } from './middleware/express';
import { createNestInterceptor } from './middleware/nestjs';
import { SBCloudAppender } from './appender/sbcloud-appender';
import { authManager } from './auth/auth-manager';
import { requestContext } from './context/request-context';

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
  async start(appId: string, appKey: string, appVersion?: string): Promise<string | undefined> {
    // Set deps and register class so the factory can create it during config()
    SBCloudAppender.setDeps({ appVersion, getToken: () => authManager.getToken() });
    appenderFactory.register('SBCloudAppender', SBCloudAppender);

    connectionClient.setDeps({
      getToken: () => authManager.getToken(),
      refreshToken: async () => {
        const result = await authManager.login(appId, appKey);
        if (result.config) {
          logManager.config(result.config);
          storage.setObj('config', result.config);
        }
        return result.success;
      }
    });

    // Load persisted config
    let config = await storage.getObj<ConfigResponse>('config');
    if (!config) config = defaultConfig;
    logManager.config(config);

    // Auth via loginSdkServer (server-specific, with proactive token refresh)
    const result = await authManager.login(appId, appKey);
    if (!result.success) {
      InnerLog.w('Auth failed - logs will be buffered until auth succeeds');
    }

    // Apply and persist server config
    if (result.config) {
      logManager.config(result.config);
      storage.setObj('config', result.config);
    }

    return undefined;
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
