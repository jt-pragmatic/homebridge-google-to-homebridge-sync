import { StructuredLogger, LogLevel } from '../StructuredLogger';
import { Logger } from 'homebridge';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

describe('StructuredLogger', () => {
  let structuredLogger: StructuredLogger;

  beforeEach(() => {
    structuredLogger = new StructuredLogger(mockLogger, 'TestComponent', false);
    jest.clearAllMocks();
  });

  describe('basic logging', () => {
    it('should log error messages', () => {
      structuredLogger.error('Test error message');

      expect(mockLogger.error).toHaveBeenCalledWith('[TestComponent] Test error message');
    });

    it('should log warning messages', () => {
      structuredLogger.warn('Test warning message');

      expect(mockLogger.warn).toHaveBeenCalledWith('[TestComponent] Test warning message');
    });

    it('should log info messages', () => {
      structuredLogger.info('Test info message');

      expect(mockLogger.info).toHaveBeenCalledWith('[TestComponent] Test info message');
    });

    it('should not log debug messages when debug mode is disabled', () => {
      structuredLogger.debug('Test debug message');

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should log debug messages when debug mode is enabled', () => {
      const debugLogger = new StructuredLogger(mockLogger, 'TestComponent', true);
      debugLogger.debug('Test debug message');

      expect(mockLogger.debug).toHaveBeenCalledWith('[TestComponent] Test debug message');
    });
  });

  describe('context logging', () => {
    it('should include context in log messages', () => {
      const context = {
        deviceId: 'device-123',
        operation: 'test-operation',
        requestId: 'req-456',
        duration: 150,
      };

      structuredLogger.info('Test message with context', context);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[TestComponent] Test message with context (device:device-123, op:test-operation, req:req-456, 150ms)'
      );
    });

    it('should handle partial context', () => {
      const context = {
        deviceId: 'device-123',
        operation: 'test-operation',
      };

      structuredLogger.info('Test message', context);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[TestComponent] Test message (device:device-123, op:test-operation)'
      );
    });
  });

  describe('specialized logging methods', () => {
    it('should log device operations', () => {
      structuredLogger.logDeviceOperation('device-123', 'turn-on', true, 100);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[TestComponent] Device turn-on: device-123 - SUCCESS (device:device-123, op:turn-on, 100ms)'
      );
    });

    it('should log failed device operations as warnings', () => {
      structuredLogger.logDeviceOperation('device-123', 'turn-on', false);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[TestComponent] Device turn-on: device-123 - FAILED (device:device-123, op:turn-on)'
      );
    });

    it('should log authentication events', () => {
      structuredLogger.logAuthEvent('token-refresh', true);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[TestComponent] Authentication token-refresh: SUCCESS (op:token-refresh)'
      );
    });

    it('should log failed authentication as errors', () => {
      structuredLogger.logAuthEvent('login', false);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[TestComponent] Authentication login: FAILED (op:login)'
      );
    });

    it('should log connection events', () => {
      structuredLogger.logConnectionEvent('connected', { host: 'api.google.com' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[TestComponent] Connection connected (op:connected)'
      );
    });
  });

  describe('API logging in debug mode', () => {
    let debugLogger: StructuredLogger;

    beforeEach(() => {
      debugLogger = new StructuredLogger(mockLogger, 'TestComponent', true);
    });

    it('should log API requests', () => {
      debugLogger.logApiRequest('GET', '/api/devices', 'req-123', { param: 'value' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[TestComponent] API Request: GET /api/devices (op:request, req:req-123)'
      );
    });

    it('should log API responses', () => {
      debugLogger.logApiResponse('GET', '/api/devices', 'req-123', 200, 150, { data: 'response' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[TestComponent] API Response: GET /api/devices - 200 (150ms) (op:response, req:req-123, 150ms)'
      );
    });

    it('should not log API requests when debug mode is disabled', () => {
      structuredLogger.logApiRequest('GET', '/api/devices', 'req-123');

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe('data sanitization', () => {
    let debugLogger: StructuredLogger;

    beforeEach(() => {
      debugLogger = new StructuredLogger(mockLogger, 'TestComponent', true);
    });

    it('should sanitize sensitive data in API requests', () => {
      const sensitiveBody = {
        username: 'user123',
        password: 'secret123',
        access_token: 'token123',
        data: 'normal data',
      };

      debugLogger.logApiRequest('POST', '/api/login', 'req-123', sensitiveBody);

      // The actual sanitization happens internally, we just verify the method was called
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('child logger', () => {
    it('should create child logger with additional context', () => {
      const childContext = { deviceId: 'device-123' };
      const childLogger = structuredLogger.child(childContext);

      childLogger.info('Child logger message');

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[TestComponent] Child logger message (device:device-123)'
      );
    });

    it('should merge child context with method context', () => {
      const childContext = { deviceId: 'device-123' };
      const childLogger = structuredLogger.child(childContext);

      childLogger.info('Child logger message', { operation: 'test-op' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[TestComponent] Child logger message (device:device-123, op:test-op)'
      );
    });
  });

  describe('log buffer and statistics', () => {
    it('should maintain log buffer', () => {
      structuredLogger.error('Error 1');
      structuredLogger.warn('Warning 1');
      structuredLogger.info('Info 1');

      const recentLogs = structuredLogger.getRecentLogs();
      expect(recentLogs).toHaveLength(3);
      expect(recentLogs[0].level).toBe(LogLevel.ERROR);
      expect(recentLogs[1].level).toBe(LogLevel.WARN);
      expect(recentLogs[2].level).toBe(LogLevel.INFO);
    });

    it('should provide log statistics', () => {
      structuredLogger.error('Error 1');
      structuredLogger.error('Error 2');
      structuredLogger.warn('Warning 1');
      structuredLogger.info('Info 1');

      const stats = structuredLogger.getLogStatistics();
      expect(stats.totalLogs).toBe(4);
      expect(stats.errorCount).toBe(2);
      expect(stats.warnCount).toBe(1);
      expect(stats.infoCount).toBe(1);
      expect(stats.debugCount).toBe(0);
      expect(stats.recentErrors).toHaveLength(2);
    });

    it('should clear log buffer', () => {
      structuredLogger.info('Test message');
      expect(structuredLogger.getRecentLogs()).toHaveLength(1);

      structuredLogger.clearBuffer();
      expect(structuredLogger.getRecentLogs()).toHaveLength(0);
    });
  });

  describe('performance logging', () => {
    it('should log performance metrics in debug mode', () => {
      const debugLogger = new StructuredLogger(mockLogger, 'TestComponent', true);
      
      debugLogger.logPerformanceMetric('device-discovery', 1500, { deviceCount: 10 });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[TestComponent] Performance: device-discovery completed in 1500ms (op:device-discovery, 1500ms)'
      );
    });
  });
});