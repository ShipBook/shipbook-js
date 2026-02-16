import type { BaseAppender } from './base-appender';
import ConsoleAppender from './console-appender';
import type { ConfigResponse } from '../models/config-response';

type AppenderClass = new (name: string, config?: ConfigResponse) => BaseAppender;

class AppenderFactory {
  private registry = new Map<string, AppenderClass>();

  register(type: string, cls: AppenderClass): void {
    this.registry.set(type, cls);
  }

  create(type: string, name: string, config?: ConfigResponse): BaseAppender {
    const AppenderCls = this.registry.get(type);
    if (!AppenderCls) throw new Error(`Unknown appender type: ${type}`);
    return new AppenderCls(name, config);
  }
}

const appenderFactory = new AppenderFactory();
appenderFactory.register('ConsoleAppender', ConsoleAppender);

export default appenderFactory;
