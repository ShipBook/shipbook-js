import type { BaseAppender } from './base-appender';
import ConsoleAppender from './console-appender';
import SBCloudAppender, { SBCloudAppenderDeps } from './sbcloud-appender';
import type { ConfigResponse } from '../models/config-response';

/**
 * Factory for creating appenders
 * SBCloudAppender requires additional dependencies to be provided
 * Custom appenders can be registered via registerAppender()
 */
class AppenderFactory {
  private sbCloudDeps?: SBCloudAppenderDeps;
  private customAppenders = new Map<string, BaseAppender>();

  /**
   * Configure dependencies needed for SBCloudAppender
   */
  configureSBCloudDeps(deps: SBCloudAppenderDeps): void {
    this.sbCloudDeps = deps;
  }

  /**
   * Register a custom appender instance
   * This allows platform-specific appenders (like NodeAppender) to be used with logManager.config()
   */
  registerAppender(type: string, appender: BaseAppender): void {
    this.customAppenders.set(type, appender);
  }

  /**
   * Unregister a custom appender
   */
  unregisterAppender(type: string): void {
    this.customAppenders.delete(type);
  }

  create(type: string, name: string, config?: ConfigResponse): BaseAppender {
    // Check custom appenders first
    const customAppender = this.customAppenders.get(type);
    if (customAppender) {
      return customAppender;
    }

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
