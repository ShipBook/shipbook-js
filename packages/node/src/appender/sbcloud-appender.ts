import type { BaseAppender, BaseLog, User, ConfigResponse, Session } from '@shipbook/core';
import { Severity, SeverityUtil, InnerLog, connectionClient, HttpMethod, CORE_VERSION, Platform } from '@shipbook/core';
import { PLATFORM_VERSION } from '../generated/version';
import { requestContext } from '../context/request-context';
import { storage } from '../adapters/storage';
import { randomUUID } from 'crypto';
import * as os from 'os';

const MACHINE_UDID_KEY = 'machine_udid';

interface SessionBatch {
  sessionId: string;
  userInfo?: User;
  metadata: Record<string, unknown>;
  isBackground?: boolean;
  jobName?: string;
  startTime: Date;
  logs: BaseLog[];
}

export interface SBCloudAppenderDeps {
  appVersion?: string;
  getToken: () => string | undefined;
}

/**
 * Node.js cloud appender — registered as 'SBCloudAppender' so server config
 * (which references that name) activates this appender via appenderFactory.
 */
export class SBCloudAppender implements BaseAppender {
  name: string;

  private sessionBatches = new Map<string, SessionBatch>();
  private timer?: ReturnType<typeof setTimeout>;
  private maxTime = 3;  // seconds
  private flushSeverity = Severity.Verbose;
  private flushSize = 1000;
  private machineUdid?: string;
  private backgroundSessionId = randomUUID();  // One session per process lifecycle

  private static _deps: SBCloudAppenderDeps;
  private appVersion: string | undefined;
  private getToken: () => string | undefined;

  static setDeps(deps: SBCloudAppenderDeps): void {
    SBCloudAppender._deps = deps;
  }

  constructor(name: string, config?: ConfigResponse) {
    this.name = name;
    this.appVersion = SBCloudAppender._deps.appVersion;
    this.getToken = SBCloudAppender._deps.getToken;
    this.update(config);
    this.restoreFromStorage();
    this.initMachineUdid();
  }

  private async initMachineUdid(): Promise<void> {
    const stored = await storage.getItem(MACHINE_UDID_KEY);
    if (stored) {
      this.machineUdid = stored;
    } else {
      this.machineUdid = randomUUID();
      await storage.setItem(MACHINE_UDID_KEY, this.machineUdid);
    }
  }

  async push(log: BaseLog): Promise<void> {
    InnerLog.d('push() called');
    const ctx = requestContext.get();
    const sessionId = ctx?.sessionId || this.backgroundSessionId;

    // Get or create batch for this session
    let batch = this.sessionBatches.get(sessionId);
    if (!batch) {
      // Default to isBackground: true when no context (fallback background session)
      const isBackground = ctx?.isBackground ?? true;
      batch = {
        sessionId,
        userInfo: ctx?.user,
        metadata: ctx?.metadata || { type: 'background' },
        isBackground,
        jobName: ctx?.jobName,
        startTime: new Date(),
        logs: []
      };
      this.sessionBatches.set(sessionId, batch);
    }

    // Update user info if it changed (user might login after session started)
    if (ctx?.user && !batch.userInfo) {
      batch.userInfo = ctx.user;
    }

    // Attach traceId to the log (only for HTTP requests)
    const logWithTrace = {
      ...log,
      traceId: ctx?.traceId  // undefined for background logs
    };

    batch.logs.push(logWithTrace);

    // Persist log incrementally (append-only, efficient)
    await this.appendLogToStorage(sessionId, logWithTrace);

    // Check if we should flush
    this.scheduleFlush(log);
  }

  private scheduleFlush(log: BaseLog): void {
    // Flush immediately only for high-severity logs (Warning, Error) so we don't flood send() on every push
    const logSeverityValue = 'severity' in log ? SeverityUtil.value((log as any).severity) : 0;
    const warningValue = SeverityUtil.value(Severity.Warning);
    if (logSeverityValue <= warningValue) {
      this.flush();
      return;
    }

    // Start timer if not running (batched flush for Verbose/Debug/Info)
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

  // Efficient storage: append log to existing session data
  private async appendLogToStorage(sessionId: string, log: BaseLog): Promise<void> {
    try {
      const batch = this.sessionBatches.get(sessionId);
      if (!batch) return;

      // Use pushArrayObj to append incrementally (not rewrite everything)
      const storageKey = `session_${sessionId}`;
      await storage.pushArrayObj(storageKey, {
        type: 'log',
        data: log
      });

      // Also store session metadata (only once per session)
      if (batch.logs.length === 1) {
        await storage.setObj(`session_meta_${sessionId}`, {
          sessionId: batch.sessionId,
          userInfo: batch.userInfo,
          metadata: batch.metadata,
          isBackground: batch.isBackground,
          time: batch.startTime.toISOString()
        });

        // Track session in list
        const sessionList = await storage.getObj<string[]>('session_list') || [];
        if (!sessionList.includes(sessionId)) {
          sessionList.push(sessionId);
          await storage.setObj('session_list', sessionList);
        }
      }
    } catch (error) {
      InnerLog.e('Failed to persist log:', error);
    }
  }

  private async restoreFromStorage(): Promise<void> {
    try {
      // Find all session metadata keys
      const sessionList = await storage.getObj<string[]>('session_list');
      if (!sessionList?.length) return;

      for (const sessionId of sessionList) {
        const meta = await storage.getObj<{
          sessionId: string;
          userInfo?: User;
          metadata: Record<string, unknown>;
          isBackground?: boolean;
          time: string;
        }>(`session_meta_${sessionId}`);

        const logsData = await storage.popAllArrayObj(`session_${sessionId}`) as Array<{ type: string; data: BaseLog }>;

        if (meta) {
          this.sessionBatches.set(sessionId, {
            sessionId: meta.sessionId,
            userInfo: meta.userInfo,
            metadata: meta.metadata,
            isBackground: meta.isBackground,
            startTime: new Date(meta.time),
            logs: logsData.map(l => l.data)
          });
        }

        // Clean up
        await storage.removeItem(`session_meta_${sessionId}`);
      }

      await storage.removeItem('session_list');

      // If we restored data, trigger a send
      if (this.sessionBatches.size > 0) {
        this.scheduleFlush({} as BaseLog);
      }
    } catch (error) {
      InnerLog.e('Failed to restore from storage:', error);
    }
  }

  private async send(): Promise<void> {
    InnerLog.d('send() called');
    const token = this.getToken();
    if (!token) {
      InnerLog.d('No auth token yet, cannot send logs');
      return;
    }

    if (this.sessionBatches.size === 0) {
      InnerLog.d('No sessions to send');
      return;
    }
    InnerLog.d('Sending ' + this.sessionBatches.size + ' sessions');

    // Build payload from all sessions; every session includes node identity (deviceInfo, os, appInfo).
    const sessions: Session[] = [];
    for (const batch of this.sessionBatches.values()) {
      sessions.push({
        sessionId: batch.sessionId,
        userInfo: batch.userInfo,
        metadata: batch.metadata,
        isBackground: batch.isBackground,
        jobName: batch.jobName,
        time: batch.startTime.toISOString(),
        platform: Platform.NODE,
        deviceInfo: {
          udid: this.machineUdid || randomUUID(),
          os: Platform.NODE,
          deviceName: os.hostname()
        },
        os: {
          name: os.platform(),
          version: os.release()
        },
        appInfo: {
          version: this.appVersion
        },
        sdkInfo: {
          version: `core:${CORE_VERSION}/node:${PLATFORM_VERSION}`
        },
        logs: batch.logs
      });
    }

    const missing = sessions.find(s => !s.deviceInfo || !s.os || !s.appInfo);
    if (missing) {
      InnerLog.e('Skipping ingest: every session must include deviceInfo, os, and appInfo (node identity). Session: ' + missing.sessionId);
      return;
    }

    const payload = { sessions };

    // Clear batches before sending
    this.sessionBatches.clear();

    // Clear storage
    try {
      await storage.removeItem('session_list');
    } catch {
      // Ignore storage errors
    }

    try {
      const response = await connectionClient.request(
        'sessions/ingest',
        payload,
        HttpMethod.POST
      );

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
