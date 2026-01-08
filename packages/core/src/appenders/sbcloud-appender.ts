import InnerLog from '../utils/inner-log';
import type BaseEvent from '../models/base-event';
import type BaseLog from '../models/base-log';
import { LogType } from '../models/base-log';
import type Exception from '../models/exception';
import type { Login } from '../models/login';
import type Message from '../models/message';
import { Severity, SeverityUtil } from '../models/severity';
import type User from '../models/user';
import type { ConfigResponse } from '../models/config-response';
import type { BaseAppender } from './base-appender';
import { USER_CHANGE, CONNECTED, eventEmitter } from '../utils/event-emitter';
import type { IStorage } from '../interfaces/storage';
import type { IEventManager } from '../interfaces/event-manager';

enum DataType {
  Token = 'token',
  Login = 'login',
  User = 'user'
}

interface StorageData {
  type: string;
  data: unknown;
}

interface SessionData {
  token?: string;
  login?: Login;
  logs: BaseLog[];
  user?: User;
}

const SESSION_DATA = 'session_data';

/**
 * Dependencies required by SBCloudAppender
 */
export interface SBCloudAppenderDeps {
  storage: IStorage;
  eventManager: IEventManager;
  getToken: () => string | undefined;
  getLoginObj: () => Login | undefined;
  getUser: () => User | undefined;
  sendRequest: (url: string, body: object, method: string) => Promise<Response>;
}

export default class SBCloudAppender implements BaseAppender {
  name: string;
  private maxTime = 3;
  private flushSeverity = Severity.Verbose;
  private flushSize = 1000;
  private maxLogSize = 5000;

  private flushQueue: BaseLog[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private hasLog = false;
  private unsubscribeBackground?: () => void;

  private deps: SBCloudAppenderDeps;

  static started = false;

  constructor(name: string, deps: SBCloudAppenderDeps, config?: ConfigResponse) {
    this.name = name;
    this.deps = deps;
    this.update(config);

    // Subscribe to background events for flushing
    this.unsubscribeBackground = this.deps.eventManager.onBackground(async () => {
      InnerLog.d('Entered background');
      await this.send();
    });

    SBCloudAppender.started = true;

    this.changeUser = this.changeUser.bind(this);
    this.connected = this.connected.bind(this);
    eventEmitter.addListener(USER_CHANGE, this.changeUser);
    eventEmitter.addListener(CONNECTED, this.connected);
  }

  destructor(): void {
    InnerLog.d('destructor called');
    if (this.unsubscribeBackground) {
      this.unsubscribeBackground();
      this.unsubscribeBackground = undefined;
    }
    eventEmitter.removeListener(USER_CHANGE, this.changeUser);
    eventEmitter.removeListener(CONNECTED, this.connected);
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private changeUser(): void {
    InnerLog.i('user changed');
    const user = this.deps.getUser();
    if (user) {
      this.saveToStorage(user);
      this.createTimer();
    }
  }

  private connected(): void {
    InnerLog.i('Connected!');
    this.send();
  }

  update(config?: ConfigResponse): void {
    if (!config) return;
    this.maxTime = (config.maxTime as number) ?? this.maxTime;
    this.flushSeverity = config.flushSeverity 
      ? Severity[config.flushSeverity as keyof typeof Severity] 
      : this.flushSeverity;
    this.flushSize = (config.flushSize as number) ?? this.flushSize;
  }

  async push(log: BaseLog): Promise<void> {
    if (log.type === LogType.Message) {
      await this.pushMessage(log as Message);
    } else if (log.type === LogType.Exception) {
      await this.pushException(log as Exception);
    } else {
      await this.pushEvent(log as BaseEvent);
    }
  }

  private async pushMessage(log: Message): Promise<void> {
    const message = await log.getObj();
    this.flushQueue.push(message);
    
    if (SeverityUtil.value(this.flushSeverity) < SeverityUtil.value(message.severity)) {
      InnerLog.d('entered flush queue');
      if (this.flushQueue.length > this.flushSize) {
        this.flushQueue.shift();
      }
    } else {
      InnerLog.d('entered save');
      const flushQueue = [...this.flushQueue];
      this.flushQueue = [];
      await this.saveToStorage(flushQueue);
      this.createTimer();
    }
  }

  private async pushException(exception: Exception): Promise<void> {
    this.flushQueue.push(exception);
    const flushQueue = [...this.flushQueue];
    this.flushQueue = [];
    await this.saveToStorage(flushQueue);
  }

  private async pushEvent(event: BaseEvent): Promise<void> {
    this.flushQueue.push(event);
    if (this.flushQueue.length > this.flushSize) {
      this.flushQueue.shift();
    }
  }

  flush(): void {
    InnerLog.d('flushed logs');
    this.send();
  }

  private async send(): Promise<void> {
    InnerLog.d('entered send');
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (!this.deps.getToken()) return;

    try {
      const sessionsData = await this.loadSessionData();
      if (sessionsData.length === 0) return;

      const resp = await this.deps.sendRequest(
        'sessions/uploadSavedData',
        sessionsData,
        'POST'
      );
      
      if (resp.ok) {
        const text = await resp.text();
        InnerLog.i('got ok of upload ' + text);
      } else {
        const text = await resp.text();
        InnerLog.e('got not ok of upload ' + text);
      }
    } catch (error) {
      InnerLog.e('Failed to send session data', error);
    }
  }

  private async loadSessionData(): Promise<SessionData[]> {
    const storageData = await this.deps.storage.popAllArrayObj(SESSION_DATA) as StorageData[];
    this.hasLog = false;
    const sessionsData: SessionData[] = [];
    let sessionData: SessionData | undefined = undefined;

    if (storageData.length === 0) return [];

    for (const data of storageData) {
      switch (data.type) {
        case DataType.Token:
          if (sessionData) sessionsData.push(sessionData);
          sessionData = { token: (data.data as { token: string }).token, logs: [] };
          break;

        case DataType.Login:
          if (sessionData) sessionsData.push(sessionData);
          sessionData = { login: data.data as Login, logs: [] };
          break;

        case DataType.User:
          if (sessionData) {
            sessionData.user = data.data as User;
          }
          InnerLog.i('the user data', sessionData?.user);
          break;

        case LogType.Exception: {
          const { name, reason, stack } = data.data as { name: string; reason: string; stack: string };
          // Import Exception dynamically to avoid circular deps
          const { default: Exception } = await import('../models/exception');
          const exception = await new Exception(name, reason, stack).getObj();
          sessionData!.logs.push(exception);
          break;
        }

        default:
          sessionData!.logs.push(data.data as BaseLog);
          break;
      }
    }

    if (sessionData) sessionsData.push(sessionData);
    return sessionsData;
  }

  private async saveToStorage(data: BaseLog[] | User): Promise<void> {
    const size = await this.deps.storage.arraySize(SESSION_DATA);
    if (size > this.maxLogSize) {
      await this.deps.storage.popAllArrayObj(SESSION_DATA);
    }

    const storageData: StorageData[] = [];
    
    if (!this.hasLog) {
      this.hasLog = true;
      const token = this.deps.getToken();
      const loginObj = this.deps.getLoginObj();
      
      if (token) {
        storageData.push({
          type: DataType.Token,
          data: { token }
        });
      } else if (loginObj) {
        storageData.push({
          type: DataType.Login,
          data: loginObj
        });
      }
    }

    if (Array.isArray(data)) {
      const logs = data as BaseLog[];
      logs.forEach(log => {
        storageData.push({
          type: log.type,
          data: log
        });
      });
    } else {
      storageData.push({
        type: DataType.User,
        data
      });
    }

    await this.deps.storage.pushArrayObj(SESSION_DATA, storageData);
  }

  private createTimer(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.send();
      this.timer = undefined;
    }, this.maxTime * 1000);
  }
}
