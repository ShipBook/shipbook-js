import { Shipbook as CoreShipbook, Log, logManager, appenderFactory, InnerLog, connectionClient } from '@shipbook/core';
import { storage, platform, eventManager, exceptionHandler } from './adapters';
import { createExpressMiddleware } from './middleware/express';
import { createNestInterceptor } from './middleware/nestjs';
import { NodeAppender } from './appender/node-appender';
import { authManager } from './auth/auth-manager';
import { requestContext } from './context/request-context';

// Node-specific config - console appender + NodeAppender (no SBCloudAppender)
const nodeConfig = {
  appenders: [
    {
      type: 'ConsoleAppender',
      name: 'console',
      config: { pattern: '$message' }
    },
    {
      type: 'NodeAppender',  // Will be provided via appenderFactory.registerAppender()
      name: 'NodeAppender'
    }
  ],
  loggers: [
    {
      name: '',
      severity: 'Verbose',
      appenderRef: 'console'
    },
    {
      name: '',
      severity: 'Verbose',
      appenderRef: 'NodeAppender'
    }
  ]
};

class ShipbookNode {
  private appender?: NodeAppender;

  constructor() {
    // Configure core with Node.js adapters
    CoreShipbook.configure({
      storage,
      platform,
      eventManager,
      exceptionHandler
    });
  }

  async start(appId: string, appKey: string, appVersion?: string): Promise<string | undefined> {
    // Configure connectionClient with auth functions
    connectionClient.configure({
      getToken: () => authManager.getToken(),
      refreshToken: () => authManager.login(appId, appKey)
    });

    // Login (don't block if fails - SDK should never prevent app from running)
    const loginSuccess = await authManager.login(appId, appKey);
    if (!loginSuccess) {
      InnerLog.w('Auth failed - logs will be buffered until auth succeeds');
    }

    // Initialize appender (works even without auth - buffers logs)
    this.appender = new NodeAppender(appVersion);

    // Register NodeAppender with the factory so config() can create the logger for it
    appenderFactory.registerAppender('NodeAppender', this.appender);

    // Configure log manager with Node-specific config (no SBCloudAppender)
    logManager.config(nodeConfig);

    return undefined;
  }

  getLogger(tag: string): Log {
    return CoreShipbook.getLogger(tag);
  }

  enableInnerLog(enable: boolean): void {
    CoreShipbook.enableInnerLog(enable);
  }

  setConnectionUrl(url: string): void {
    CoreShipbook.setConnectionUrl(url);
  }

  registerUser(
    userId: string,
    userName?: string,
    fullName?: string,
    email?: string,
    phoneNumber?: string,
    additionalInfo?: object
  ): void {
    CoreShipbook.registerUser(userId, userName, fullName, email, phoneNumber, additionalInfo);
  }

  logout(): void {
    CoreShipbook.logout();
  }

  flush(): void {
    CoreShipbook.flush();
  }

  screen(name: string): void {
    CoreShipbook.screen(name);
  }

  getUUID(): string | undefined {
    return CoreShipbook.getUUID();
  }

  // Express middleware factory
  expressMiddleware = createExpressMiddleware;

  // NestJS interceptor factory
  nestjsInterceptor = createNestInterceptor;

  // For background jobs - wrap code to get organized session grouping
  runInContext<T>(
    options: { jobId: string; metadata?: Record<string, unknown> },
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
    this.appender?.flush();
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
