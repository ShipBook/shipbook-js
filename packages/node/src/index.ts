import { Log, appenderFactory, logManager, InnerLog, connectionClient, HttpMethod, Message, Exception } from '@shipbook/core';
import type { ConfigResponse } from '@shipbook/core';
import * as fs from 'fs';
import * as path from 'path';
import { storage, exceptionHandler } from './adapters';
import { createExpressMiddleware } from './middleware/express';
import { createNestInterceptor } from './middleware/nestjs';
import { SBCloudAppender } from './appender/sbcloud-appender';
import { authManager } from './auth/auth-manager';
import { requestContext } from './context/request-context';
import { runInRequest } from './middleware/request-events';
import { instrumentMcpTransport } from './mcp/mcp-transport';

const DEFAULT_CONFIG_REFRESH_INTERVAL = 300; // 5 minutes in seconds
const SEND_BEFORE_EXIT_TIMEOUT = 2000; // ms, as Sentry's shutdownTimeout
const EXIT_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

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
  private exitListeners: [string, () => void][] = [];

  async start(appId: string, appKey: string, appVersion?: string): Promise<string | undefined> {
    // Set deps and register class so the factory can create it during config()
    SBCloudAppender.setDeps({ appVersion: appVersion ?? this.detectAppVersion(), getToken: () => authManager.getToken() });
    appenderFactory.register('SBCloudAppender', SBCloudAppender);
    this.captureExit();

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
    this.exitListeners.forEach(([event, listener]) => process.removeListener(event, listener));
    this.exitListeners = [];
    logManager.flush();
    authManager.destroy();
  }

  // Listening to these events takes over Node's own reaction (print and exit, or terminate), so it's redone here unless the app has its own listener.
  private captureExit(): void {
    if (exceptionHandler.isActive()) return;
    let exiting = false;
    exceptionHandler.start((name, message, stack, isFatal) => {
      logManager.push(new Exception(name, message, stack ?? ''));
      const event = isFatal ? 'uncaughtException' : 'unhandledRejection';
      if (process.listenerCount(event) > 1) return;
      // Node's default for an unhandled rejection is to crash (--unhandled-rejections=throw); warn and none keep running.
      const rejectionMode = [...process.execArgv, ...(process.env.NODE_OPTIONS?.split(' ') ?? [])]
        .find(arg => arg.startsWith('--unhandled-rejections='))?.split('=')[1] ?? 'throw';
      if (!isFatal && !['throw', 'strict'].includes(rejectionMode)) return;
      if (exiting) return;
      exiting = true;
      console.error(stack ?? `${name}: ${message}`);
      this.sendBeforeExit().finally(() => process.exit(1));
    });

    for (const signal of EXIT_SIGNALS) {
      const onSignal = () => {
        if (process.listenerCount(signal) > 1) {
          this.sendBeforeExit();
          return;
        }
        this.sendBeforeExit().finally(() => {
          process.removeListener(signal, onSignal);
          process.kill(process.pid, signal);
        });
      };
      process.on(signal, onSignal);
      this.exitListeners.push([signal, onSignal]);
    }
    const onBeforeExit = () => logManager.flush();
    process.on('beforeExit', onBeforeExit);
    this.exitListeners.push(['beforeExit', onBeforeExit]);
  }

  private sendBeforeExit(): Promise<void> {
    const timeout = new Promise<void>(resolve => setTimeout(resolve, SEND_BEFORE_EXIT_TIMEOUT));
    return Promise.race([SBCloudAppender.instance?.flush(), timeout]);
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
