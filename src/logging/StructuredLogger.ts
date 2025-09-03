import { Logger } from 'homebridge';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogContext {
  component?: string;
  deviceId?: string;
  operation?: string;
  requestId?: string;
  duration?: number | undefined;
  [key: string]: unknown | undefined;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  timestamp: number;
  error?: Error | undefined;
}

export class StructuredLogger {
  private readonly baseLogger: Logger;
  private readonly debugMode: boolean;
  private readonly component: string;
  private readonly logBuffer: LogEntry[] = [];
  private readonly maxBufferSize = 1000;

  constructor(baseLogger: Logger, component: string, debugMode = false) {
    this.baseLogger = baseLogger;
    this.component = component;
    this.debugMode = debugMode;
  }

  /**
   * Log an error message
   */
  error(message: string, context?: LogContext, error?: Error): void {
    const logEntry = this.createLogEntry(LogLevel.ERROR, message, context, error);
    this.addToBuffer(logEntry);
    
    const formattedMessage = this.formatMessage(message, context);
    
    if (error) {
      this.baseLogger.error(formattedMessage, error);
    } else {
      this.baseLogger.error(formattedMessage);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    const logEntry = this.createLogEntry(LogLevel.WARN, message, context);
    this.addToBuffer(logEntry);
    
    const formattedMessage = this.formatMessage(message, context);
    this.baseLogger.warn(formattedMessage);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    const logEntry = this.createLogEntry(LogLevel.INFO, message, context);
    this.addToBuffer(logEntry);
    
    const formattedMessage = this.formatMessage(message, context);
    this.baseLogger.info(formattedMessage);
  }

  /**
   * Log a debug message (only if debug mode is enabled)
   */
  debug(message: string, context?: LogContext): void {
    const logEntry = this.createLogEntry(LogLevel.DEBUG, message, context);
    this.addToBuffer(logEntry);
    
    if (this.debugMode) {
      const formattedMessage = this.formatMessage(message, context);
      this.baseLogger.debug(formattedMessage);
    }
  }

  /**
   * Log API request details (only in debug mode)
   */
  logApiRequest(method: string, url: string, requestId: string, body?: unknown): void {
    if (!this.debugMode) {
      return;
    }

    const context: LogContext = {
      component: this.component,
      operation: 'request',
      requestId,
      method,
      url,
    };

    if (body) {
      // Sanitize sensitive data before logging
      const sanitizedBody = this.sanitizeData(body);
      context.body = sanitizedBody;
    }

    this.debug(`API Request: ${method} ${url}`, context);
  }

  /**
   * Log API response details (only in debug mode)
   */
  logApiResponse(
    method: string,
    url: string,
    requestId: string,
    status: number,
    duration: number,
    body?: unknown,
  ): void {
    if (!this.debugMode) {
      return;
    }

    const context: LogContext = {
      component: 'API',
      operation: 'response',
      requestId,
      method,
      url,
      status,
      duration,
    };

    if (body) {
      const sanitizedBody = this.sanitizeData(body);
      context.body = sanitizedBody;
    }

    this.debug(`API Response: ${method} ${url} - ${status} (${duration}ms)`, context);
  }

  /**
   * Log device operation
   */
  logDeviceOperation(
    deviceId: string,
    operation: string,
    success: boolean,
    duration?: number,
    details?: Record<string, unknown>,
  ): void {
    const context: LogContext = {
      component: 'Device',
      deviceId,
      operation,
      success,
      duration,
      ...details,
    };

    const message = `Device ${operation}: ${deviceId} - ${success ? 'SUCCESS' : 'FAILED'}`;
    
    if (success) {
      this.info(message, context);
    } else {
      this.warn(message, context);
    }
  }

  /**
   * Log authentication events
   */
  logAuthEvent(event: string, success: boolean, details?: Record<string, unknown>): void {
    const context: LogContext = {
      component: 'Auth',
      operation: event,
      success,
      ...details,
    };

    const message = `Authentication ${event}: ${success ? 'SUCCESS' : 'FAILED'}`;
    
    if (success) {
      this.info(message, context);
    } else {
      this.error(message, context);
    }
  }

  /**
   * Log connection events
   */
  logConnectionEvent(event: string, details?: Record<string, unknown>): void {
    const context: LogContext = {
      component: 'Connection',
      operation: event,
      ...details,
    };

    this.info(`Connection ${event}`, context);
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetric(operation: string, duration: number, details?: Record<string, unknown>): void {
    const context: LogContext = {
      component: 'Performance',
      operation,
      duration,
      ...details,
    };

    this.debug(`Performance: ${operation} completed in ${duration}ms`, context);
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): StructuredLogger {
    const childLogger = new StructuredLogger(this.baseLogger, this.component, this.debugMode);
    
    // Override methods to include additional context
    const originalMethods = {
      error: childLogger.error.bind(childLogger),
      warn: childLogger.warn.bind(childLogger),
      info: childLogger.info.bind(childLogger),
      debug: childLogger.debug.bind(childLogger),
    };

    childLogger.error = (message: string, context?: LogContext, error?: Error) => {
      originalMethods.error(message, { ...additionalContext, ...context }, error);
    };

    childLogger.warn = (message: string, context?: LogContext) => {
      originalMethods.warn(message, { ...additionalContext, ...context });
    };

    childLogger.info = (message: string, context?: LogContext) => {
      originalMethods.info(message, { ...additionalContext, ...context });
    };

    childLogger.debug = (message: string, context?: LogContext) => {
      originalMethods.debug(message, { ...additionalContext, ...context });
    };

    return childLogger;
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count = 100): LogEntry[] {
    return this.logBuffer.slice(-count);
  }

  /**
   * Get log statistics
   */
  getLogStatistics(): {
    totalLogs: number;
    errorCount: number;
    warnCount: number;
    infoCount: number;
    debugCount: number;
    recentErrors: LogEntry[];
    } {
    const errorCount = this.logBuffer.filter(entry => entry.level === LogLevel.ERROR).length;
    const warnCount = this.logBuffer.filter(entry => entry.level === LogLevel.WARN).length;
    const infoCount = this.logBuffer.filter(entry => entry.level === LogLevel.INFO).length;
    const debugCount = this.logBuffer.filter(entry => entry.level === LogLevel.DEBUG).length;
    
    const recentErrors = this.logBuffer
      .filter(entry => entry.level === LogLevel.ERROR)
      .slice(-10);

    return {
      totalLogs: this.logBuffer.length,
      errorCount,
      warnCount,
      infoCount,
      debugCount,
      recentErrors,
    };
  }

  /**
   * Clear log buffer
   */
  clearBuffer(): void {
    this.logBuffer.length = 0;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error,
  ): LogEntry {
    const logEntry: LogEntry = {
      level,
      message,
      context: {
        component: this.component,
        ...context,
      },
      timestamp: Date.now(),
      error: error ?? undefined,
    };
    
    return logEntry;
  }

  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    
    // Keep buffer size under control
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.splice(0, this.logBuffer.length - this.maxBufferSize);
    }
  }

  private formatMessage(message: string, context?: LogContext): string {
    if (!context || Object.keys(context).length === 0) {
      return `[${this.component}] ${message}`;
    }

    const contextParts: string[] = [];
    
    if (context.deviceId) {
      contextParts.push(`device:${context.deviceId}`);
    }
    
    if (context.operation) {
      contextParts.push(`op:${context.operation}`);
    }
    
    if (context.requestId) {
      contextParts.push(`req:${context.requestId}`);
    }
    
    if (context.duration !== undefined) {
      contextParts.push(`${context.duration}ms`);
    }

    const contextString = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';
    
    return `[${this.component}] ${message}${contextString}`;
  }

  private sanitizeData(data: unknown): unknown {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'auth',
      'credential',
      'refresh_token',
      'access_token',
      'client_secret',
    ];

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveKeys.some(sensitiveKey => lowerKey.includes(sensitiveKey))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
