import type BaseLog from '../models/base-log';
import type { ConfigResponse } from '../models/config-response';

export interface BaseAppender {
  name: string;
  update(config?: ConfigResponse): void;
  push(log: BaseLog): void | Promise<void>;
  flush(): void;
  destructor(): void;
}
