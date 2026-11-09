import {
  CONNECTED,
  USER_CHANGE,
  eventEmitter,
  InnerLog,
  logManager,
  connectionClient,
  HttpMethod,
  appenderFactory,
  Exception,
  AppEvent,
  CORE_VERSION,
  SESSION_LINK_HEADER,
  APP_ID_HEADER,
  SDK_HEADER
} from '@shipbook/core';
import type {
  User,
  ConfigResponse,
  IStorage,
  IPlatform,
  IEventManager,
  IExceptionHandler
} from '@shipbook/core';
import { Login } from './models';
import type { LoginOptions, LoginResponse, RefreshTokenResponse } from './models';
import { SBCloudAppender } from './appenders';
import { CLIENT_VERSION } from './generated';

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

const PAUSE_KEY = 'pause';
const DEFAULT_PAUSE_SECONDS = 60 * 60;
const MAX_PAUSE_SECONDS = 30 * 24 * 60 * 60;

interface Pause {
  appId: string;
  sdkVersion: string;
  until: number;
}

class SessionManager {
  token?: string;
  sessionLink?: string;
  private _loginObj?: Login;
  user?: User;
  appId?: string;
  appKey?: string;

  private isInLoginRequest = false;
  private configured = false;
  private sdkVersion!: string;
  private pause?: Pause;

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
   * Initialize the session manager with platform adapters and register SBCloudAppender.
   */
  init(options: {
    storage: IStorage;
    platform: IPlatform;
    eventManager: IEventManager;
    exceptionHandler: IExceptionHandler;
    platformVersion?: string;
  }): void {
    this.storage = options.storage;
    this.platform = options.platform;
    this.eventManager = options.eventManager;
    this.exceptionHandler = options.exceptionHandler;

    // Build concatenated SDK version string: "core:1.0.5/client:1.0.0/browser:1.0.4"
    const parts = [`core:${CORE_VERSION}`, `client:${CLIENT_VERSION}`];
    if (options.platformVersion) parts.push(`${this.platform.platformName}:${options.platformVersion}`);
    this.sdkVersion = parts.join('/');

    const sdkHeader = `${this.platform.platformName}/${options.platformVersion ?? CLIENT_VERSION}`;
    connectionClient.setDeps({
      getToken: () => this.token,
      refreshToken: () => this.refreshToken(),
      controlPlane: {
        getHeaders: () => ({ [APP_ID_HEADER]: this.appId!, [SDK_HEADER]: sdkHeader }),
        isPaused: () => this.isPaused(),
        onResponse: resp => this.readPauseSignal(resp)
      }
    });

    // Set deps and register class so the factory can create it during config()
    SBCloudAppender.setDeps({
      storage: this.storage,
      eventManager: this.eventManager,
      getToken: () => this.token,
      getLoginObj: () => this.loginObj,
      getUser: () => this.user,
      isPaused: () => this.dropsLogs(),
      sendRequest: (url, body, method) =>
        connectionClient.request(url, body, method as HttpMethod)
    });
    appenderFactory.register('SBCloudAppender', SBCloudAppender);

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

    this.appId = appId;
    this.appKey = appKey;
    this.loginObj = new Login(appId, appKey, this.platform, this.storage, this.sdkVersion, options);

    let pause: Pause | undefined;
    try {
      pause = await this.storage.getObj<Pause>(PAUSE_KEY);
    } catch (e) {
      InnerLog.w('stored pause is corrupt, deleting it', e);
      await this.storage.removeItem(PAUSE_KEY);
    }
    const paused = pause?.appId === appId && pause.sdkVersion === this.sdkVersion && pause.until > Date.now();
    this.pause = paused ? pause : undefined;
    if (this.pause) {
      InnerLog.w(`Shipbook is paused until ${new Date(this.pause.until).toISOString()} (from an earlier run); nothing will be sent`);
    }
    if (pause && !paused) await this.storage.removeItem(PAUSE_KEY);

    let config: ConfigResponse | undefined;
    try {
      config = await this.storage.getObj<ConfigResponse>('config');
    } catch (e) {
      // A corrupt cached config must never block login, otherwise the SDK stays silent until app data is cleared.
      InnerLog.w('cached config is corrupt, deleting it and falling back to the default config', e);
      await this.storage.removeItem('config');
    }
    this.readConfig(config ?? defaultConfig);

    return this.innerLogin();
  }

  async innerLogin(): Promise<string | undefined> {
    if (this.isInLoginRequest || !this.loginObj || this.isPaused()) return;

    this.isInLoginRequest = true;
    this.pause = undefined;
    this.token = undefined;
    this.sessionLink = undefined;

    try {
      const loginObj = await this.loginObj.getObj();
      const resp = await connectionClient.request('auth/loginSdk', loginObj, HttpMethod.POST);
      this.isInLoginRequest = false;

      if (resp.ok) {
        const json = await resp.json() as LoginResponse;
        InnerLog.i('Succeeded! : ' + JSON.stringify(json));
        this.token = json.token;
        this.sessionLink = json.sessionLink;

        // Set config information
        this.readConfig(json.config);
        eventEmitter.emit(CONNECTED);

        this.storage.setObj('config', json.config);

        return json.sessionUrl;
      }
      else if (resp.status >= 400 && resp.status < 500) {
        // 4xx on loginSdk = integration error (bad appId/appKey, app deleted). Retrying won't help — caller must fix the integration.
        const text = await resp.text();
        InnerLog.e(`loginSdk rejected with ${resp.status} — check appId/appKey. Will not retry. body: ${text}`);
        return;
      }
      else {
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

  private isPaused(): boolean {
    return !!this.pause && Date.now() < this.pause.until;
  }

  // The cloud appender's first log or user change after a pause ends logs in again: nothing else retries a login.
  private dropsLogs(): boolean {
    if (this.isPaused()) return true;
    if (this.pause) this.innerLogin();
    return false;
  }

  private readPauseSignal(resp: Response): void {
    if (resp.status < 400) return;

    const retryAfter = resp.headers.get('Retry-After') ?? '';
    const usable = /^\d+$/.test(retryAfter) && Number(retryAfter) > 0;
    if (!usable && resp.status !== 429) return;

    const seconds = usable ? Math.min(Number(retryAfter), MAX_PAUSE_SECONDS) : DEFAULT_PAUSE_SECONDS;
    this.pause = { appId: this.appId!, sdkVersion: this.sdkVersion, until: Date.now() + seconds * 1000 };
    this.token = undefined;
    this.sessionLink = undefined;
    this.storage.setObj(PAUSE_KEY, this.pause);
    const answer = usable ? `with Retry-After ${retryAfter}` : 'without Retry-After';
    InnerLog.w(`Shipbook paused until ${new Date(this.pause.until).toISOString()}: the server answered ${resp.status} ${answer}`);
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
      this.loginObj = new Login(this.appId, this.appKey, this.platform, this.storage, this.sdkVersion);
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

  // Empty until login completes and on silenced devices, so callers can always spread it.
  getSessionHeaders(): Record<string, string> {
    if (!this.sessionLink) return {};
    return { [SESSION_LINK_HEADER]: this.sessionLink };
  }
}

export default new SessionManager();
