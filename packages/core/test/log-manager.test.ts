import logManager from '../src/log-manager';
import appenderFactory from '../src/appenders/appender-factory';
import type { BaseAppender } from '../src/appenders/base-appender';
import BaseLog, { LogType } from '../src/models/base-log';
import Message from '../src/models/message';
import { Severity } from '../src/models/severity';
import type { ConfigResponse } from '../src/models/config-response';
import Log from '../src/log';

let testAppenderInstance: TestAppender | null = null;
let configCounter = 0;

class TestAppender implements BaseAppender {
  name: string;
  logs: BaseLog[] = [];

  get messages(): Message[] {
    return this.logs.filter((log): log is Message => log instanceof Message);
  }

  constructor(name: string, _config?: ConfigResponse) {
    this.name = name;
    testAppenderInstance = this;
  }

  update(_config?: ConfigResponse): void {}
  push(log: BaseLog): void { this.logs.push(log); }
  flush(): void {}
  destructor(): void {}

  clear(): void { this.logs = []; }
}

// Register TestAppender with the factory
appenderFactory.register('TestAppender', TestAppender);

function configureWithTestAppender(
  severity: string = 'Verbose',
  callStackSeverity?: string,
  module: string = ''
): TestAppender {
  configCounter++;
  testAppenderInstance = null;
  const appenderName = `test-${configCounter}`;
  const loggerEntry: Record<string, unknown> = {
    name: module,
    severity,
    appenderRef: appenderName
  };
  if (callStackSeverity) {
    loggerEntry.callStackSeverity = callStackSeverity;
  }

  logManager.config({
    appenders: [{ type: 'TestAppender', name: appenderName }],
    loggers: [loggerEntry]
  } as unknown as ConfigResponse);

  return testAppenderInstance!;
}

describe('LogManager with TestAppender', () => {
  let appender: TestAppender;

  beforeEach(() => {
    appender = configureWithTestAppender();
  });

  test('push message is received by appender', () => {
    const msg = new Message('test message', Severity.Error, 'TestTag');
    logManager.push(msg);

    expect(appender.logs.length).toBe(1);
    expect(appender.messages.length).toBe(1);
    expect(appender.messages[0].message).toBe('test message');
    expect(appender.messages[0].severity).toBe(Severity.Error);
    expect(appender.messages[0].tag).toBe('TestTag');
  });

  test('all severity levels are captured', () => {
    const severities = [Severity.Error, Severity.Warning, Severity.Info, Severity.Debug, Severity.Verbose];
    severities.forEach(sev => {
      logManager.push(new Message(`${sev} message`, sev, 'Tag'));
    });

    expect(appender.messages.length).toBe(5);
    severities.forEach((sev, i) => {
      expect(appender.messages[i].severity).toBe(sev);
    });
  });

  test('severity filtering works', () => {
    appender = configureWithTestAppender('Warning');

    logManager.push(new Message('error', Severity.Error, 'Tag'));
    logManager.push(new Message('warning', Severity.Warning, 'Tag'));
    logManager.push(new Message('info', Severity.Info, 'Tag'));
    logManager.push(new Message('debug', Severity.Debug, 'Tag'));
    logManager.push(new Message('verbose', Severity.Verbose, 'Tag'));

    expect(appender.messages.length).toBe(2);
    expect(appender.messages[0].message).toBe('error');
    expect(appender.messages[1].message).toBe('warning');
  });

  test('tag-based routing', () => {
    configCounter++;
    let uiAppender: TestAppender | null = null;
    let dataAppender: TestAppender | null = null;

    class UIAppender extends TestAppender {
      constructor(name: string, config?: ConfigResponse) {
        super(name, config);
        uiAppender = this;
      }
    }
    class DataAppender extends TestAppender {
      constructor(name: string, config?: ConfigResponse) {
        super(name, config);
        dataAppender = this;
      }
    }

    appenderFactory.register('UIAppender', UIAppender);
    appenderFactory.register('DataAppender', DataAppender);

    logManager.config({
      appenders: [
        { type: 'UIAppender', name: `ui-${configCounter}` },
        { type: 'DataAppender', name: `data-${configCounter}` }
      ],
      loggers: [
        { name: 'ui', severity: 'Verbose', appenderRef: `ui-${configCounter}` },
        { name: 'data', severity: 'Verbose', appenderRef: `data-${configCounter}` }
      ]
    } as unknown as ConfigResponse);

    logManager.push(new Message('ui message', Severity.Info, 'ui.component'));
    logManager.push(new Message('data message', Severity.Info, 'data.repository'));

    expect(uiAppender!.messages.length).toBe(1);
    expect(uiAppender!.messages[0].message).toBe('ui message');
    expect(dataAppender!.messages.length).toBe(1);
    expect(dataAppender!.messages[0].message).toBe('data message');
  });

  test('message with error creates exception info', () => {
    const error = new Error('test error');
    const msg = new Message('error happened', Severity.Error, 'Tag', error);
    logManager.push(msg);

    expect(appender.messages.length).toBe(1);
    const received = appender.messages[0];
    expect(received.exception).toBeDefined();
    expect(received.exception!.name).toBe('Error');
    expect(received.exception!.reason).toBe('test error');
  });

  test('message via Log contains caller info', () => {
    const log = new Log('TestTag');
    log.i('caller test');

    expect(appender.messages.length).toBe(1);
    const received = appender.messages[0];
    expect(received.fileName).toBeTruthy();
    expect(received.lineNumber).toBeGreaterThan(0);
  });

  test('non-message log is pushed to all appenders', () => {
    const screenEvent = new BaseLog(LogType.ScreenEvent);
    logManager.push(screenEvent);

    expect(appender.logs.length).toBe(1);
    expect(appender.messages.length).toBe(0);
    expect(appender.logs[0].type).toBe(LogType.ScreenEvent);
  });

  test('getSeverity returns configured severity', () => {
    appender = configureWithTestAppender('Info');

    expect(logManager.getSeverity('Tag')).toBe(Severity.Info);
    expect(logManager.getSeverity('unknown')).toBe(Severity.Info);
  });

  test('getSeverity returns Off when no logger matches', () => {
    configCounter++;
    logManager.config({
      appenders: [{ type: 'TestAppender', name: `specific-${configCounter}` }],
      loggers: [
        { name: 'specific.tag', severity: 'Verbose', appenderRef: `specific-${configCounter}` }
      ]
    } as unknown as ConfigResponse);

    expect(logManager.getSeverity('other.tag')).toBe(Severity.Off);
    expect(logManager.getSeverity('specific.tag.child')).toBe(Severity.Verbose);
  });

  test('config replaces previous appenders', () => {
    const firstAppender = configureWithTestAppender();
    logManager.push(new Message('first', Severity.Info, 'Tag'));
    expect(firstAppender.messages.length).toBe(1);

    const secondAppender = configureWithTestAppender();
    expect(secondAppender.messages.length).toBe(0);

    logManager.push(new Message('second', Severity.Info, 'Tag'));
    expect(secondAppender.messages.length).toBe(1);
    expect(secondAppender.messages[0].message).toBe('second');
  });
});

describe('Log class with TestAppender', () => {
  let appender: TestAppender;

  beforeEach(() => {
    appender = configureWithTestAppender();
  });

  test('Log instance methods push to appender', () => {
    const log = new Log('TestTag');
    log.e('error message');

    expect(appender.messages.length).toBe(1);
    expect(appender.messages[0].message).toBe('error message');
    expect(appender.messages[0].severity).toBe(Severity.Error);
    expect(appender.messages[0].tag).toBe('TestTag');
  });

  test('Log instance severity filtering', () => {
    appender = configureWithTestAppender('Error');
    const log = new Log('TestTag');

    log.e('should pass');
    log.i('should not pass');

    expect(appender.messages.length).toBe(1);
    expect(appender.messages[0].message).toBe('should pass');
  });

  test('Log instance with error object', () => {
    const log = new Log('TestTag');
    const error = new TypeError('type mismatch');
    log.e('failed', error);

    expect(appender.messages.length).toBe(1);
    const received = appender.messages[0];
    expect(received.exception).toBeDefined();
    expect(received.exception!.name).toBe('TypeError');
    expect(received.exception!.reason).toBe('type mismatch');
  });

  test('Log static methods push to appender', () => {
    Log.e('static error');

    expect(appender.messages.length).toBe(1);
    expect(appender.messages[0].message).toBe('static error');
    expect(appender.messages[0].severity).toBe(Severity.Error);
  });
});
