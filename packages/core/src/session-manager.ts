import { CONNECTED, USER_CHANGE, eventEmitter } from './utils/event-emitter';
import InnerLog from './utils/inner-log';
import logManager from './log-manager';
import { Login, LoginOptions } from './models/login';
import type User from './models/user';
import type { ConfigResponse } from './models/config-response';
import type { LoginResponse, RefreshTokenResponse } from './models/api-responses';
import { connectionClient, HttpMethod } from './networking';
import type { IStorage } from './interfaces/storage';
import type { IPlatform } from './interfaces/platform';
import type { IEventManager } from './interfaces/event-manager';
import type { IExceptionHandler } from './interfaces/exception-handler';
import appenderFactory from './appenders/appender-factory';
import Exception from './models/exception';

const defaultConfig: ConfigResponse = {
  appenders: [
    {
      type: 'ConsoleAppender',
      name: 'console',
      config: { pattern: '$message' }
    },
    {
      type: 'SBCloudAppender',
      name: 'cloud',
      config: {
        maxTime: 5,
        flushSeverity: 'Warning'
      }
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
      appenderRef: 'cloud'
    }
  ]
};

class SessionManager {
  token?: string;
  private _loginObj?: Login;
  user?: User;
  appId?: string;
  appKey?: string;

  private isInLoginRequest = false;
  private configured = false;

  // Platform adapters
  private storage!: IStorage;
  private platform!: IPlatform;
  private eventManager!: IEventManager;
  private exceptionHandler!: IExceptionHandler;

  get loginObj(): Login | undefined {
    if (this._loginObj) {
      this._loginObj.user = this.user;
    }
    return this._loginObj;
  }

  set loginObj(loginObj: Login | undefined) {
    this._loginObj = loginObj;
  }

  /**
   * Configure the session manager with platform adapters
   */
  configure(options: {
    storage: IStorage;
    platform: IPlatform;
    eventManager: IEventManager;
    exceptionHandler: IExceptionHandler;
  }): void {
    this.storage = options.storage;
    this.platform = options.platform;
    this.eventManager = options.eventManager;
    this.exceptionHandler = options.exceptionHandler;

    // Configure connection client
    connectionClient.configure({
      getToken: () => this.token,
      refreshToken: () => this.refreshToken()
    });

    // Configure appender factory with dependencies
    appenderFactory.configureSBCloudDeps({
      storage: this.storage,
      eventManager: this.eventManager,
      getToken: () => this.token,
      getLoginObj: () => this.loginObj,
      getUser: () => this.user,
      sendRequest: (url, body, method) => 
        connectionClient.request(url, body, method as HttpMethod)
    });

    this.configured = true;
  }

  async login(
    appId: string, 
    appKey: string, 
    options?: LoginOptions
  ): Promise<string | undefined> {
    if (!this.configured) {
      throw new Error('SessionManager not configured. Call configure() first.');
    }

    let config = await this.storage.getObj<ConfigResponse>('config');
    if (!config) config = defaultConfig;

    this.readConfig(config);
    this.appId = appId;
    this.appKey = appKey;
    this.loginObj = new Login(appId, appKey, this.platform, this.storage, options);
    
    return this.innerLogin();
  }

  async innerLogin(): Promise<string | undefined> {
    if (this.isInLoginRequest || !this.loginObj) return;

    this.isInLoginRequest = true;
    this.token = undefined;
    
    try {
      const loginObj = await this.loginObj.getObj();
      const resp = await connectionClient.request('auth/loginSdk', loginObj, HttpMethod.POST);
      this.isInLoginRequest = false;

      if (resp.ok) {
        const json = await resp.json() as LoginResponse;
        InnerLog.i('Succeeded! : ' + JSON.stringify(json));
        this.token = json.token;

        // Set config information
        this.readConfig(json.config);
        eventEmitter.emit(CONNECTED);

        this.storage.setObj('config', json.config);

        return json.sessionUrl;
      } else {
        InnerLog.e("didn't succeed to log");
        const text = await resp.text();
        if (text) {
          InnerLog.e('the info that was received: ' + text);
        }
        return;
      }
    } catch (e) {
      this.isInLoginRequest = false;
      InnerLog.e('there was an error with the request', e);
      return;
    }
  }

  private readConfig(config: ConfigResponse): void {
    if (!config.exceptionReportDisabled) {
      this.startExceptionHandler();
    }
    if (!config.eventLoggingDisabled) {
      this.enableAppState();
    } else {
      this.removeAppState();
    }
    logManager.config(config);
  }

  private startExceptionHandler(): void {
    this.exceptionHandler.start((name, message, stack, isFatal) => {
      InnerLog.i(`exception error isFatal("${isFatal}") name(${name}) message("${message}"), \nstack - ${stack}`);
      const exception = new Exception(name, message, stack ?? '');
      logManager.push(exception);
    });
  }

  private appStateUnsubscribe?: () => void;

  private enableAppState(): void {
    if (this.appStateUnsubscribe) return;
    
    this.appStateUnsubscribe = this.eventManager.onStateChange?.((state) => {
      const AppEvent = require('./models/app-event').default;
      const orientation = this.eventManager.getOrientation?.() ?? 'unknown';
      const event = new AppEvent('change', state, orientation);
      logManager.push(event);
    });
  }

  private removeAppState(): void {
    if (this.appStateUnsubscribe) {
      this.appStateUnsubscribe();
      this.appStateUnsubscribe = undefined;
    }
  }

  logout(): void {
    this.token = undefined;
    this.user = undefined;
    if (this.appId && this.appKey) {
      this.loginObj = new Login(this.appId, this.appKey, this.platform, this.storage);
    }
    this.innerLogin();
  }

  registerUser(
    userId: string,
    userName?: string,
    fullName?: string,
    email?: string,
    phoneNumber?: string,
    additionalInfo?: object
  ): void {
    this.user = {
      userId,
      userName,
      fullName,
      email,
      phoneNumber,
      additionalInfo
    };
    if (this._loginObj) {
      eventEmitter.emit(USER_CHANGE);
    }
  }

  async refreshToken(): Promise<boolean> {
    const refresh = {
      token: this.token,
      appKey: this.loginObj!.appKey
    };
    this.token = undefined;
    
    try {
      const resp = await connectionClient.request('auth/refreshSdkToken', refresh, HttpMethod.POST);
      if (resp.ok) {
        const json = await resp.json() as RefreshTokenResponse;
        this.token = json.token;
        return true;
      } else {
        InnerLog.e('Failed to refresh token: HTTP error', resp.status);
        return false;
      }
    } catch (error) {
      InnerLog.e('Failed to refresh token: network error', error);
      return false;
    }
  }

  getUUID(): string | undefined {
    return this.loginObj?.udid;
  }
}

export default new SessionManager();
