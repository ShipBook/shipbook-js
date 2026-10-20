import type { BaseAppender, BaseLog, Message, RequestEvent, ConfigResponse, Session, DeviceInfo, OsInfo, AppVersionInfo, VersionInfo, RequestContext } from '@shipbook/core';
import { Severity, SeverityUtil, LogType, RequestEventPhase, InnerLog, connectionClient, HttpMethod, CORE_VERSION, Platform } from '@shipbook/core';
import { PLATFORM_VERSION } from '../generated/version';
import { requestContext } from '../context/request-context';
import { storage } from '../adapters/storage';
import { randomUUID } from 'crypto';
import * as os from 'os';

const MACHINE_UDID_KEY = 'machine_udid';
const QUEUE_KEY = 'session_queue';

enum RecordType { Session = 'session', Log = 'log' }
// Mobile's flushQueue, one per request: what waits here goes up only with a log at or above flushSeverity.
interface FlushQueue {
  logs: BaseLog[];
  saved: boolean;
}

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
  // Keyed by the context object, so a request's queue is freed with it, also when the request never finishes.
  private flushQueues = new WeakMap<RequestContext, FlushQueue>();
  private timer?: ReturnType<typeof setTimeout>;
  private maxTime = 3;  // seconds
  private flushSeverity = Severity.Verbose;
  private flushSize = 1000;
  // Not on mobile: a server can save thousands of records within maxTime, so an upload is also sent once it reaches this size.
  private maxBatchSize = 1000;
  // As on the client SDK: while uploads can't drain the queue (no token), it's emptied at this size instead of growing without bound.
  private maxLogSize = 5000;
  private savedRecords = 0;
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
    storage.arraySize(QUEUE_KEY).then(leftover => this.savedRecords += leftover);
    // Anything leftover from a previous process is drained by the first timer.
    this.createTimer();
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
    const ctx = requestContext.get() ?? requestContext.background;

    await this.trimQueue();
    await this.ensureSession(ctx);

    // requestTime keeps a request's logs contiguous in the server's display-order sort.
    const logWithTrace = { ...log, traceId: ctx.traceId, requestId: ctx.requestId, requestTime: ctx.requestId ? ctx.startTime : undefined };
    let flushQueue = this.flushQueues.get(ctx);
    if (!flushQueue) {
      flushQueue = { logs: [], saved: false };
      this.flushQueues.set(ctx, flushQueue);
    }

    if (this.isHeld(log, flushQueue)) {
      flushQueue.logs.push(logWithTrace);
      if (flushQueue.logs.length > this.flushSize) flushQueue.logs.shift();
      return;
    }

    // The flushQueue is this log's context: it is saved with it, in order.
    for (const data of [...flushQueue.logs, logWithTrace]) {
      await this.save({ type: RecordType.Log, sessionId: ctx.sessionId, data });
    }
    flushQueue.logs = [];
    flushQueue.saved = true;
    this.createTimer();
  }

  // Without this, sessions whose logs all fall below flushSeverity never reach the server, so stats compute against only error-bearing sessions.
  async ensureSession(ctx: RequestContext): Promise<void> {
    await this.trimQueue();
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

    await this.save({ type: RecordType.Session, sessionId: ctx.sessionId, data: session });
  }

  // Runs before anything is written, so the record that follows writes its own session descriptor again.
  private async trimQueue(): Promise<void> {
    if (this.savedRecords < this.maxLogSize) return;
    InnerLog.d('queue over maxLogSize, dropping it');
    this.emittedSessions.clear();
    this.savedRecords = 0;
    await storage.popAllArrayObj(QUEUE_KEY);
  }

  private async save(record: QueueRecord): Promise<void> {
    await storage.pushArrayObj(QUEUE_KEY, record);
    if (++this.savedRecords >= this.maxBatchSize) this.flush();
  }

  private isHeld(log: BaseLog, flushQueue: FlushQueue): boolean {
    switch (log.type) {
      case LogType.Message:
        return SeverityUtil.value(this.flushSeverity) < SeverityUtil.value((log as Message).severity);
      // Unlike mobile, an exception doesn't end a Node process, so it is saved like an error and the timer still sends it.
      case LogType.Exception:
        return false;
      // A request whose logs went up keeps its end: it carries the status, outcome and duration.
      case LogType.RequestEvent:
        return !(flushQueue.saved && (log as RequestEvent).event === RequestEventPhase.End);
      default:
        return true;
    }
  }

  private createTimer(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.send();
    }, this.maxTime * 1000);
  }

  flush(): void {
    InnerLog.d('flushed logs');
    this.send();
  }

  private async send(): Promise<void> {
    InnerLog.d('send() called');
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.getToken()) {
      InnerLog.d('No auth token yet, cannot send logs');
      return;
    }

    // Drain the queue atomically. New pushes after this point land in a fresh queue and
    // get picked up by the next flush.
    // Cleared before the await: a log pushed meanwhile must write its descriptor into the next queue, not skip it.
    this.emittedSessions.clear();
    this.savedRecords = 0;
    const records = await storage.popAllArrayObj(QUEUE_KEY) as QueueRecord[];

    if (records.length === 0) {
      InnerLog.d('No sessions to send');
      return;
    }

    // Group records by sessionId — descriptor populates the Session, logs append.
    const sessionsMap = new Map<string, Session>();
    for (const record of records) {
      if (record.type === RecordType.Session) {
        // A repeated descriptor must not replace the session and drop the logs already grouped under it.
        if (!sessionsMap.has(record.sessionId)) sessionsMap.set(record.sessionId, record.data as Session);
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
    if (config.maxBatchSize) this.maxBatchSize = config.maxBatchSize as number;
    if (config.maxLogSize) this.maxLogSize = config.maxLogSize as number;
  }

  destructor(): void {
    this.send();
  }
}
