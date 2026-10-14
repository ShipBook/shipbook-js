import type { BaseAppender, BaseLog, ConfigResponse, Session, DeviceInfo, OsInfo, AppVersionInfo, VersionInfo, RequestContext } from '@shipbook/core';
import { Severity, SeverityUtil, InnerLog, connectionClient, HttpMethod, CORE_VERSION, Platform } from '@shipbook/core';
import { PLATFORM_VERSION } from '../generated/version';
import { requestContext } from '../context/request-context';
import { storage } from '../adapters/storage';
import { randomUUID } from 'crypto';
import * as os from 'os';

const MACHINE_UDID_KEY = 'machine_udid';
const QUEUE_KEY = 'session_queue';

enum RecordType { Session = 'session', Log = 'log' }
interface QueueRecord {
  type: RecordType;
  sessionId: string;
  data: Session | BaseLog;
}

export interface SBCloudAppenderDeps {
  appVersion?: string;
  getToken: () => string | undefined;
}

/**
 * Node.js cloud appender — registered as 'SBCloudAppender' so server config
 * (which references that name) activates this appender via appenderFactory.
 *
 * Single queue with typed records: every session descriptor and every log is
 * appended to `session_queue` via IStorage.pushArrayObj. send() drains via
 * popAllArrayObj, groups records by sessionId, posts the result. Mirrors iOS's
 * CloudQueue pattern but with explicit sessionId per record since Node has
 * many concurrent sessions per process.
 */
export class SBCloudAppender implements BaseAppender {
  name: string;

  // Tracks which sessionIds we've already written a descriptor record for in the current
  // flush window. Cleared on each send() so the next window starts fresh. Lives only in
  // memory — no storage involvement. Sync Set ops make this race-free within the JS event loop.
  private emittedSessions = new Set<string>();
  private timer?: ReturnType<typeof setTimeout>;
  private maxTime = 3;  // seconds
  private flushSeverity = Severity.Verbose;
  private flushSize = 1000;
  // One background session per process lifecycle — id + start time created together,
  // so any push that falls back to this context describes the same logical entity.
  private backgroundContext: RequestContext = {
    sessionId: randomUUID(),
    startTime: new Date(),
    isBackground: true,
    metadata: { type: 'background' }
  };

  private deviceInfo: DeviceInfo;
  private osInfo: OsInfo;
  private appInfo: AppVersionInfo;
  private sdkInfo: VersionInfo;

  private static _deps: SBCloudAppenderDeps;
  private getToken: () => string | undefined;

  static setDeps(deps: SBCloudAppenderDeps): void {
    SBCloudAppender._deps = deps;
  }

  constructor(name: string, config?: ConfigResponse) {
    this.name = name;
    this.getToken = SBCloudAppender._deps.getToken;
    this.deviceInfo = {
      udid: randomUUID(),  // placeholder, replaced by initMachineUdid if storage has one
      os: Platform.NODE,
      deviceName: os.hostname()
    };
    this.osInfo = { name: os.platform(), version: os.release() };
    this.appInfo = { version: SBCloudAppender._deps.appVersion };
    this.sdkInfo = { version: `core:${CORE_VERSION}/node:${PLATFORM_VERSION}` };
    this.update(config);
    this.initMachineUdid();
    // Anything leftover from a previous process is drained by the first scheduled flush.
    this.scheduleFlush({} as BaseLog);
  }

  private async initMachineUdid(): Promise<void> {
    const stored = await storage.getItem(MACHINE_UDID_KEY);
    if (stored) {
      this.deviceInfo.udid = stored;
    } else {
      await storage.setItem(MACHINE_UDID_KEY, this.deviceInfo.udid);
    }
  }

  async push(log: BaseLog): Promise<void> {
    InnerLog.d('push() called');
    const ctx = requestContext.get() ?? this.backgroundContext;

    await this.ensureSession(ctx);

    const logWithTrace = { ...log, traceId: ctx.traceId, requestId: ctx.requestId };
    await storage.pushArrayObj(QUEUE_KEY, {
      type: RecordType.Log,
      sessionId: ctx.sessionId,
      data: logWithTrace
    });

    this.scheduleFlush(log);
  }

  // Without this, sessions whose logs all fall below flushSeverity never reach the server, so stats compute against only error-bearing sessions.
  async ensureSession(ctx: RequestContext): Promise<void> {
    if (this.emittedSessions.has(ctx.sessionId)) return;
    this.emittedSessions.add(ctx.sessionId);

    const session: Session = {
      sessionId: ctx.sessionId,
      userInfo: ctx.user,
      metadata: ctx.metadata || { type: 'background' },
      isBackground: ctx.isBackground ?? true,
      jobName: ctx.jobName,
      callerSessionLink: ctx.callerSessionLink,
      time: ctx.startTime.toISOString(),
      platform: Platform.NODE,
      deviceInfo: this.deviceInfo,
      os: this.osInfo,
      appInfo: this.appInfo,
      sdkInfo: this.sdkInfo,
      logs: []
    };

    await storage.pushArrayObj(QUEUE_KEY, {
      type: RecordType.Session,
      sessionId: ctx.sessionId,
      data: session
    });
  }

  private scheduleFlush(log: BaseLog): void {
    // Flush immediately only for high-severity logs (Warning, Error) so we don't flood send() on every push
    const logSeverityValue = 'severity' in log ? SeverityUtil.value((log as any).severity) : 0;
    const warningValue = SeverityUtil.value(Severity.Warning);
    if (logSeverityValue <= warningValue) {
      this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush();
        this.timer = undefined;
      }, this.maxTime * 1000);
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.send();
  }

  private async send(): Promise<void> {
    InnerLog.d('send() called');
    if (!this.getToken()) {
      InnerLog.d('No auth token yet, cannot send logs');
      return;
    }

    // Drain the queue atomically. New pushes after this point land in a fresh queue and
    // get picked up by the next flush.
    const records = await storage.popAllArrayObj(QUEUE_KEY) as QueueRecord[];
    this.emittedSessions.clear();

    if (records.length === 0) {
      InnerLog.d('No sessions to send');
      return;
    }

    // Group records by sessionId — descriptor populates the Session, logs append.
    const sessionsMap = new Map<string, Session>();
    for (const record of records) {
      if (record.type === RecordType.Session) {
        sessionsMap.set(record.sessionId, record.data as Session);
      } else if (record.type === RecordType.Log) {
        const session = sessionsMap.get(record.sessionId);
        if (session) session.logs!.push(record.data as BaseLog);
        // else: log for a session whose descriptor we don't have. Drop — shouldn't
        // happen because ensureSession is awaited before the first log per session.
      }
    }

    const sessions = [...sessionsMap.values()];
    if (sessions.length === 0) return;
    InnerLog.d('Sending ' + sessions.length + ' sessions');

    try {
      const response = await connectionClient.request('sessions/ingest', { sessions }, HttpMethod.POST);
      if (response.ok) {
        InnerLog.i('Ingest succeeded: ' + response.status);
      } else {
        const text = await response.text();
        InnerLog.e('Ingest failed: ' + response.status + ' ' + text);
      }
    } catch (error) {
      InnerLog.e('Ingest error:', error);
    }
  }

  update(config?: ConfigResponse): void {
    if (!config) return;
    if (config.maxTime) this.maxTime = config.maxTime as number;
    if (config.flushSeverity) this.flushSeverity = Severity[config.flushSeverity as keyof typeof Severity];
    if (config.flushSize) this.flushSize = config.flushSize as number;
  }

  destructor(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.send();
  }
}
