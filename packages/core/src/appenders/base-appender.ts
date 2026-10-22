import type BaseLog from '../models/base-log';
import type { ConfigResponse } from '../models/config-response';
import type { RequestContext } from '../models/request-context';

export interface BaseAppender {
  name: string;
  update(config?: ConfigResponse): void;
  push(log: BaseLog): void | Promise<void>;
  flush(): void | Promise<void>;
  destructor(): void;
  // A request began in ctx: queue its session and count it, whether or not it ever logs.
  startRequest?(ctx: RequestContext): void;
}
