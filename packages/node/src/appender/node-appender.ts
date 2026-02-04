import type { BaseAppender, BaseLog, User, ConfigResponse } from '@shipbook/core';
import { Severity, SeverityUtil, InnerLog, connectionClient, HttpMethod } from '@shipbook/core';
import { requestContext } from '../context/request-context';
import { storage } from '../adapters/storage';
import { authManager } from '../auth/auth-manager';
import * as os from 'os';

interface StoredSession {
  sessionId: string;
  userInfo?: User;
  metadata?: Record<string, unknown>;
  time: string;
  platform: string;
  deviceInfo: {
    udid: string;
    os: string;
    deviceName?: string;
  };
  os: {
    name: string;
    version: string;
  };
  appInfo: {
    version?: string;
  };
  sdkInfo: {
    version: string;
  };
  logs: BaseLog[];
}

interface IngestPayload {
  sessions: StoredSession[];
}

interface SessionBatch {
  sessionId: string;
  userInfo?: User;
  metadata: Record<string, unknown>;
  startTime: Date;
  logs: BaseLog[];
}

export class NodeAppender implements BaseAppender {
  name = 'NodeAppender';

  private sessionBatches = new Map<string, SessionBatch>();
  private timer?: ReturnType<typeof setTimeout>;
  private maxTime = 3;  // seconds
  private flushSeverity = Severity.Verbose;
  private flushSize = 1000;

  constructor(private appVersion?: string) {
    this.restoreFromStorage();
  }

  async push(log: BaseLog): Promise<void> {
    InnerLog.d('push() called');
    const ctx = requestContext.get();
    const sessionId = ctx?.sessionId || this.createSessionId();

    // Get or create batch for this session
    let batch = this.sessionBatches.get(sessionId);
    if (!batch) {
      batch = {
        sessionId,
        userInfo: ctx?.user,
        metadata: ctx?.metadata || { type: 'background' },
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

  private createSessionId(): string {
    const today = new Date().toISOString().split('T')[0];
    return `background_${today}`;
  }

  /** Node identity sent with every session so the server knows which host sent the logs. */
  private getNodeSessionInfo(sessionId: string): Pick<StoredSession, 'deviceInfo' | 'os' | 'appInfo' | 'sdkInfo'> {
    return {
      deviceInfo: {
        udid: `node_${sessionId}`,
        os: 'node',
        deviceName: os.hostname()
      },
      os: {
        name: 'node',
        version: process.version
      },
      appInfo: {
        version: this.appVersion
      },
      sdkInfo: {
        version: '1.0.0'  // TODO: Get from package.json
      }
    };
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
          time: string;
        }>(`session_meta_${sessionId}`);

        const logsData = await storage.popAllArrayObj(`session_${sessionId}`) as Array<{ type: string; data: BaseLog }>;

        if (meta) {
          this.sessionBatches.set(sessionId, {
            sessionId: meta.sessionId,
            userInfo: meta.userInfo,
            metadata: meta.metadata,
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
    const token = authManager.getToken();
    if (!token) {
      InnerLog.e('No auth token, cannot send logs');
      return;
    }

    if (this.sessionBatches.size === 0) {
      InnerLog.d('No sessions to send');
      return;
    }
    InnerLog.d('Sending ' + this.sessionBatches.size + ' sessions');

    // Build payload from all sessions; every session includes node identity (deviceInfo, os, appInfo).
    const sessions: StoredSession[] = [];
    for (const batch of this.sessionBatches.values()) {
      const sessionNodeInfo = this.getNodeSessionInfo(batch.sessionId);
      sessions.push({
        sessionId: batch.sessionId,
        userInfo: batch.userInfo,
        metadata: batch.metadata,
        time: batch.startTime.toISOString(),
        platform: 'node',
        deviceInfo: sessionNodeInfo.deviceInfo,
        os: sessionNodeInfo.os,
        appInfo: sessionNodeInfo.appInfo,
        sdkInfo: sessionNodeInfo.sdkInfo,
        logs: batch.logs
      });
    }

    const missing = sessions.find(s => !s.deviceInfo || !s.os || !s.appInfo);
    if (missing) {
      InnerLog.e('Skipping ingest: every session must include deviceInfo, os, and appInfo (node identity). Session: ' + missing.sessionId);
      return;
    }

    const payload: IngestPayload = { sessions };

    // Debug: log the payload structure
    InnerLog.d('Payload type: ' + typeof payload);
    InnerLog.d('Payload sessions count: ' + payload.sessions.length);
    InnerLog.d('First session logs count: ' + payload.sessions[0]?.logs?.length);

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
