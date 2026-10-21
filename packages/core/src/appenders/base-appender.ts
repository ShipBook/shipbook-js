import type BaseLog from '../models/base-log';
import type { ConfigResponse } from '../models/config-response';
import type { RequestContext } from '../models/request-context';

export interface BaseAppender {
  name: string;
  update(config?: ConfigResponse): void;
  push(log: BaseLog): void | Promise<void>;
  flush(): void | Promise<void>;
  destructor(): void;
  ensureSession?(ctx: RequestContext): void;
}
