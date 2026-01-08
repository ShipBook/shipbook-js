export interface ConfigResponse {
  [key: string]: unknown;
  eventLoggingDisabled?: boolean;
  exceptionReportDisabled?: boolean;

  appenders: AppenderResponse[];
  loggers: LoggerResponse[];
  root?: RootResponse;
}

export interface AppenderResponse {
  type: string;
  name: string;
  config?: Record<string, unknown>;
}

export interface LoggerResponse {
  name?: string;
  severity: string;
  callStackSeverity?: string;
  appenderRef: string;
}

export interface RootResponse {
  severity: string;
  appenderRef: string;
}
