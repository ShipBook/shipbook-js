import type { BaseAppender } from './base-appender';
import ConsoleAppender from './console-appender';
import SBCloudAppender, { SBCloudAppenderDeps } from './sbcloud-appender';
import type { ConfigResponse } from '../models/config-response';

/**
 * Factory for creating appenders
 * SBCloudAppender requires additional dependencies to be provided
 */
class AppenderFactory {
  private sbCloudDeps?: SBCloudAppenderDeps;

  /**
   * Configure dependencies needed for SBCloudAppender
   */
  configureSBCloudDeps(deps: SBCloudAppenderDeps): void {
    this.sbCloudDeps = deps;
  }

  create(type: string, name: string, config?: ConfigResponse): BaseAppender {
    switch (type) {
      case 'ConsoleAppender':
        return new ConsoleAppender(name, config);
      case 'SBCloudAppender':
        if (!this.sbCloudDeps) {
          throw new Error('SBCloudAppender dependencies not configured. Call configureSBCloudDeps first.');
        }
        return new SBCloudAppender(name, this.sbCloudDeps, config);
      default:
        throw new Error(`Unknown appender type: ${type}`);
    }
  }
}

export default new AppenderFactory();
