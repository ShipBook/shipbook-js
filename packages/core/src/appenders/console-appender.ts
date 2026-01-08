import type BaseLog from '../models/base-log';
import { LogType } from '../models/base-log';
import type Message from '../models/message';
import { Severity } from '../models/severity';
import type { ConfigResponse } from '../models/config-response';
import type { BaseAppender } from './base-appender';

export default class ConsoleAppender implements BaseAppender {
  name: string;
  pattern?: string;

  constructor(name: string, config?: ConfigResponse) {
    this.name = name;
    this.update(config);
  }

  update(config?: ConfigResponse): void {
    this.pattern = config?.pattern as string | undefined;
  }

  async push(log: BaseLog): Promise<void> {
    if (log.type === LogType.Message) {
      const message = await (log as Message).getObj();
      const text = `${message.message}`;
      
      switch (message.severity) {
        case Severity.Error:
          console.error(text);
          break;
        case Severity.Warning:
          console.warn(text);
          break;
        case Severity.Info:
          console.info(text);
          break;
        case Severity.Debug:
          console.debug(text);
          break;
        case Severity.Verbose:
        default:
          console.log(text);
      }
    }
  }

  flush(): void {
    // No buffering, nothing to flush
  }

  destructor(): void {
    // No resources to clean up
  }
}
