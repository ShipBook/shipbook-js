import type { BaseAppender, BaseLog, Message, RequestEvent, ConfigResponse, Session, DeviceInfo, OsInfo, AppVersionInfo, VersionInfo, RequestContext } from '@shipbook/core';
import { Severity, SeverityUtil, LogType, RequestEventPhase, InnerLog, connectionClient, HttpMethod, CORE_VERSION, Platform } from '@shipbook/core';
import { PLATFORM_VERSION } from '../generated/version';
import { requestContext } from '../context/request-context';
import { storage } from '../adapters/storage';
import { authManager } from '../auth/auth-manager';
import { randomUUID } from 'crypto';
import * as os from 'os';

const MACHINE_UDID_KEY = 'machine_udid';
// Busy (429/503): wait Retry-After, 300 s without one, at most an hour, as the mobile SDKs do.
const BUSY_DEFAULT_SECONDS = 300;
const BUSY_MAX_SECONDS = 3600;
// Any other failure doubles the wait from maxTime up to this.
const FAILURE_MAX_SECONDS = 300;

// Mobile's flushQueue, one per request: what waits here goes up only with a log at or above flushSeverity.
interface FlushQueue {
  logs: BaseLog[];
  saved: boolean;
}

/**
 * Node.js cloud appender — registered as 'SBCloudAppender' so server config
 * (which references that name) activates this appender via appenderFactory.
 *
 * The cloud queue lives in memory, per process, like other server SDKs (OpenTelemetry,
 * Sentry, Better Stack): sessions keyed by sessionId, each collecting its saved logs,
 * and send() uploads them as they are.
 */
export class SBCloudAppender implements BaseAppender {
  name: string;

  private cloudQueue = new Map<string, Session>();
  // Sessions in cloudQueue plus their logs: what maxBatchSize and maxLogSize measure.
  private queueSize = 0;
  // Keyed by the context object, so a request's queue is freed with it, also when the request never finishes.
  private flushQueues = new WeakMap<RequestContext, FlushQueue>();
  private timer?: ReturnType<typeof setTimeout>;
  private maxTime = 3;  // seconds
  private flushSeverity = Severity.Verbose;
  private flushSize = 100;  // per request, not per app as on mobile
  // Not on mobile: a server can save thousands of records within maxTime, so an upload is also sent once it reaches this size.
  private maxBatchSize = 1000;
  // As on the client SDK: while uploads can't drain the queue (no token), it's emptied at this size instead of growing without bound.
  private maxLogSize = 5000;
  // After a failed upload the timer sends nothing before this (epoch ms); an explicit flush() still does.
  private heldUntil?: number;
  private failures = 0;
  private deviceInfo: DeviceInfo;
  private osInfo: OsInfo;
  private appInfo: AppVersionInfo;
  private sdkInfo: VersionInfo;

  constructor(name: string, config?: ConfigResponse) {
    this.name = name;
    this.deviceInfo = {
      udid: randomUUID(),  // placeholder, replaced by initMachineUdid if storage has one
      os: Platform.NODE,
      deviceName: os.hostname()
    };
    this.osInfo = { name: os.platform(), version: os.release() };
    this.appInfo = { version: authManager.appVersion };
    this.sdkInfo = { version: `core:${CORE_VERSION}/node:${PLATFORM_VERSION}` };
    this.update(config);
    this.initMachineUdid();
  }

  private async initMachineUdid(): Promise<void> {
    const stored = await storage.getItem(MACHINE_UDID_KEY);
    if (stored) {
      this.deviceInfo.udid = stored;
    } else {
      await storage.setItem(MACHINE_UDID_KEY, this.deviceInfo.udid);
    }
  }

  push(log: BaseLog): void {
    InnerLog.d('push() called');
    const ctx = requestContext.get() ?? requestContext.background;
    const session = this.session(ctx);

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
    session.logs!.push(...flushQueue.logs, logWithTrace);
    this.queueSize += flushQueue.logs.length + 1;
    flushQueue.logs = [];
    flushQueue.saved = true;
    this.afterSave();
  }

  // Counted on the session, not as a log: the server adds it up, and a request whose logs all fall below flushSeverity still counts.
  startRequest(ctx: RequestContext): void {
    this.session(ctx).requests!++;
  }

  private session(ctx: RequestContext): Session {
    if (this.queueSize >= this.maxLogSize) {
      InnerLog.d('cloud queue over maxLogSize, dropping it');
      this.cloudQueue.clear();
      this.queueSize = 0;
    }
    const queued = this.cloudQueue.get(ctx.sessionId);
    if (queued) return queued;

    const session: Session = {
      sessionId: ctx.sessionId,
      userInfo: ctx.user,
      attributes: ctx.attributes,
      isBackground: ctx.isBackground ?? true,
      jobName: ctx.jobName,
      callerSessionLink: ctx.callerSessionLink,
      time: ctx.startTime.toISOString(),
      platform: Platform.NODE,
      deviceInfo: this.deviceInfo,
      os: this.osInfo,
      appInfo: this.appInfo,
      sdkInfo: this.sdkInfo,
      logs: [],
      requests: 0
    };
    this.cloudQueue.set(ctx.sessionId, session);
    this.queueSize++;
    this.afterSave();
    return session;
  }

  private afterSave(): void {
    if (this.queueSize >= this.maxBatchSize && !this.heldUntil) this.sendSoon();
    else this.createTimer();
  }

  // Not synchronously: send() empties the queue at once, and the push() that filled the batch still adds its log to it.
  private sendSoon(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.send();
    }, 0);
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
    const wait = this.heldUntil ? Math.max(this.heldUntil - Date.now(), 0) : this.maxTime * 1000;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.send();
    }, wait);
  }

  flush(): Promise<void> {
    InnerLog.d('flushed logs');
    return this.send();
  }

  private async send(): Promise<void> {
    InnerLog.d('send() called');
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!authManager.getToken()) {
      InnerLog.d('No auth token yet, cannot send logs');
      return;
    }

    const sessions = [...this.cloudQueue.values()];
    this.cloudQueue.clear();
    this.queueSize = 0;
    this.heldUntil = undefined;
    if (sessions.length === 0) {
      InnerLog.d('No sessions to send');
      return;
    }
    InnerLog.d('Sending ' + sessions.length + ' sessions');

    let response: Response;
    try {
      response = await connectionClient.request('sessions/ingest', { sessions }, HttpMethod.POST);
    } catch (error) {
      InnerLog.e('Ingest error:', error);
      return this.requeue(sessions, this.failureWait());
    }
    if (response.ok) {
      this.failures = 0;
      InnerLog.i('Ingest succeeded: ' + response.status);
      return;
    }
    InnerLog.e('Ingest failed: ' + response.status + ' ' + await response.text());
    // Busy: the server kept nothing and asks to resend later.
    if (response.status === 429 || response.status === 503) {
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '', 10);
      return this.requeue(sessions, Math.min(retryAfter > 0 ? retryAfter : BUSY_DEFAULT_SECONDS, BUSY_MAX_SECONDS));
    }
    // A server error is retried, backing off; any other 4xx would fail the same way again.
    if (response.status >= 500) this.requeue(sessions, this.failureWait());
  }

  private failureWait(): number {
    this.failures++;
    return Math.min(this.maxTime * 2 ** this.failures, FAILURE_MAX_SECONDS);
  }

  // Back in front of what was saved during the upload, and the timer waits `seconds`.
  private requeue(sessions: Session[], seconds: number): void {
    for (const session of sessions) {
      const queued = this.cloudQueue.get(session.sessionId!);
      if (!queued) {
        this.cloudQueue.set(session.sessionId!, session);
        this.queueSize += 1 + session.logs!.length;
        continue;
      }
      queued.logs!.unshift(...session.logs!);
      queued.requests! += session.requests!;
      queued.userInfo ??= session.userInfo;
      this.queueSize += session.logs!.length;
    }
    this.heldUntil = Date.now() + seconds * 1000;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.createTimer();
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
