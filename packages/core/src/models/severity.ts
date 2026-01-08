export enum Severity {
  Off = 'Off',
  Error = 'Error',
  Warning = 'Warning',
  Info = 'Info',
  Debug = 'Debug',
  Verbose = 'Verbose'
}

export class SeverityUtil {
  static value(severity: Severity): number {
    switch (severity) {
      case Severity.Off: return 0;
      case Severity.Error: return 1;
      case Severity.Warning: return 2;
      case Severity.Info: return 3;
      case Severity.Debug: return 4;
      case Severity.Verbose: return 5;
      default: return 0;
    }
  }

  static fromString(severity: string): Severity {
    const normalized = severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
    if (normalized in Severity) {
      return Severity[normalized as keyof typeof Severity];
    }
    return Severity.Off;
  }
}
