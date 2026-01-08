import appenderFactory from './appenders/appender-factory';
import type { BaseAppender } from './appenders/base-appender';
import { CONFIG_CHANGE, eventEmitter } from './utils/event-emitter';
import InnerLog from './utils/inner-log';
import type BaseLog from './models/base-log';
import type Message from './models/message';
import { Severity, SeverityUtil } from './models/severity';
import type { ConfigResponse } from './models/config-response';

interface Logger {
  key: string;
  severity: Severity;
  callStackSeverity: Severity;
  appender: BaseAppender;
}

class LogManager {
  private appenders = new Map<string, BaseAppender>();
  private loggers: Logger[] = [];

  clear(): void {
    this.appenders.forEach(appender => appender.destructor());
    InnerLog.d('called clear');
    this.appenders.clear();
    this.loggers = [];
  }

  add(appender: BaseAppender, name: string): void {
    const origAppender = this.appenders.get(name);
    if (appender !== origAppender) {
      origAppender?.destructor();
    }
    this.appenders.set(name, appender);
  }

  remove(appenderName: string): void {
    const appender = this.appenders.get(appenderName);
    appender?.destructor();
    this.appenders.delete(appenderName);
  }

  push(log: BaseLog): void {
    if (log.type === 'message') {
      const message = log as Message;
      const appenderNames = new Set<string>();
      
      this.loggers.forEach(logger => {
        if (message.tag!.startsWith(logger.key) && 
            SeverityUtil.value(message.severity) <= SeverityUtil.value(logger.severity)) {
          appenderNames.add(logger.appender.name);
        }
      });

      appenderNames.forEach(name => {
        this.appenders.get(name)?.push(log);
      });
    } else {
      // Not a message, so no tag filtering
      this.appenders.forEach(appender => {
        appender.push(log);
      });
    }
  }

  flush(): void {
    this.appenders.forEach(appender => appender.flush());
  }

  getSeverity(tag: string): Severity {
    let severity = Severity.Off;
    this.loggers.forEach(logger => {
      if (tag.startsWith(logger.key) && 
          SeverityUtil.value(logger.severity) > SeverityUtil.value(severity)) {
        severity = logger.severity;
      }
    });
    return severity;
  }

  getCallStackSeverity(tag: string): Severity {
    let callStackSeverity = Severity.Off;
    this.loggers.forEach(logger => {
      if (tag.startsWith(logger.key) && 
          SeverityUtil.value(logger.callStackSeverity) > SeverityUtil.value(callStackSeverity)) {
        callStackSeverity = logger.callStackSeverity;
      }
    });
    return callStackSeverity;
  }

  config(conf: ConfigResponse): void {
    // Clear existing appenders
    this.clear();
    
    // Create new appenders
    conf.appenders.forEach(appender => {
      try {
        const base = appenderFactory.create(
          appender.type, 
          appender.name, 
          appender.config as ConfigResponse
        );
        this.appenders.set(appender.name, base);
      } catch (e) {
        InnerLog.e("didn't succeed to create appender: " + appender.name, e);
      }
    });

    // Configure loggers
    this.loggers = [];
    conf.loggers.forEach(logger => {
      const appender = this.appenders.get(logger.appenderRef);
      if (appender) {
        const log: Logger = {
          key: logger.name ?? '',
          severity: Severity[logger.severity as keyof typeof Severity] ?? Severity.Off,
          callStackSeverity: logger.callStackSeverity 
            ? Severity[logger.callStackSeverity as keyof typeof Severity] 
            : Severity.Off,
          appender: appender
        };
        this.loggers.push(log);
      }
    });

    eventEmitter.emit(CONFIG_CHANGE);
  }
}

export default new LogManager();
