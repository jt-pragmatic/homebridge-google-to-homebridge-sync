import { ConfigValidator } from '../ConfigValidator';
import { DeviceType } from '../../types';
import { Logger } from 'homebridge';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator(mockLogger);
    jest.clearAllMocks();
  });

  describe('validateConfig', () => {
    it('should validate a complete valid configuration', () => {
      const config = {
        name: 'Google Home Sync',
        clientId: '123456789-abcdefghijklmnop.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-abcdefghijklmnopqrstuvwxyz',
        refreshToken: '1//0abcdefghijklmnopqrstuvwxyz',
        pollingInterval: 30,
        debugMode: false,
        deviceFilter: {
          includeTypes: [DeviceType.LIGHT, DeviceType.SWITCH],
          excludeRooms: ['Garage'],
        },
        customNames: {
          'device-123': 'Living Room Light',
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedConfig).toBeDefined();
    });

    it('should validate minimal valid configuration', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing required fields', () => {
      const config = {
        name: 'Test Platform',
        // Missing clientId and clientSecret
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Google OAuth Client ID is required');
      expect(result.errors).toContain('Google OAuth Client Secret is required');
    });

    it('should fail validation for empty name', () => {
      const config = {
        name: '',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Platform name is required and must be a non-empty string');
    });

    it('should warn about invalid client ID format', () => {
      const config = {
        name: 'Test Platform',
        clientId: 'invalid-client-id',
        clientSecret: 'GOCSPX-testsecret',
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Google OAuth Client ID format appears invalid');
    });

    it('should warn about invalid client secret format', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'invalid-secret',
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Google OAuth Client Secret format appears invalid');
    });
  });

  describe('polling interval validation', () => {
    it('should adjust polling interval if too short', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        pollingInterval: 2,
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Polling interval is too short, minimum is 5 seconds');
      expect(result.sanitizedConfig?.pollingInterval).toBe(5);
    });

    it('should adjust polling interval if too long', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        pollingInterval: 500,
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Polling interval is too long, maximum is 300 seconds');
      expect(result.sanitizedConfig?.pollingInterval).toBe(300);
    });

    it('should fail validation for non-integer polling interval', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        pollingInterval: 'invalid',
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Polling interval must be an integer');
    });
  });

  describe('device filter validation', () => {
    it('should validate valid device filter', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        deviceFilter: {
          includeTypes: [DeviceType.LIGHT, DeviceType.SWITCH],
          excludeTypes: [DeviceType.CAMERA],
          includeRooms: ['Living Room', 'Kitchen'],
          excludeRooms: ['Garage'],
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for invalid device types', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        deviceFilter: {
          includeTypes: ['invalid.device.type', DeviceType.LIGHT],
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid device types in includeTypes: invalid.device.type');
    });

    it('should warn about conflicting include/exclude types', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        deviceFilter: {
          includeTypes: [DeviceType.LIGHT, DeviceType.SWITCH],
          excludeTypes: [DeviceType.LIGHT], // Conflict
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        `Device types appear in both include and exclude lists: ${DeviceType.LIGHT}`
      );
    });

    it('should warn about conflicting include/exclude rooms', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        deviceFilter: {
          includeRooms: ['Living Room', 'Kitchen'],
          excludeRooms: ['Kitchen'], // Conflict
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Rooms appear in both include and exclude lists: Kitchen');
    });

    it('should remove duplicate device types', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        deviceFilter: {
          includeTypes: [DeviceType.LIGHT, DeviceType.LIGHT, DeviceType.SWITCH],
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig?.deviceFilter?.includeTypes).toEqual([
        DeviceType.LIGHT,
        DeviceType.SWITCH,
      ]);
    });

    it('should fail validation for empty room names', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        deviceFilter: {
          includeRooms: ['Living Room', '', 'Kitchen'],
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('All room names must be non-empty strings');
    });
  });

  describe('custom names validation', () => {
    it('should validate valid custom names', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        customNames: {
          'device-123': 'Living Room Light',
          'device-456': 'Kitchen Switch',
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about invalid custom names format', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        customNames: 'invalid', // Should be object
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Custom names must be an object, ignoring');
      expect(result.sanitizedConfig?.customNames).toBeUndefined();
    });

    it('should filter out invalid custom name entries', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        customNames: {
          'device-123': 'Valid Name',
          '': 'Invalid Device ID',
          'device-456': '', // Invalid name
          'device-789': 'Another Valid Name',
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Invalid device ID in custom names: ""');
      expect(result.warnings).toContain('Invalid custom name for device "device-456": must be a non-empty string');
      expect(result.sanitizedConfig?.customNames).toEqual({
        'device-123': 'Valid Name',
        'device-789': 'Another Valid Name',
      });
    });
  });

  describe('debug mode validation', () => {
    it('should convert non-boolean debug mode to boolean', () => {
      const config = {
        name: 'Test Platform',
        clientId: '123456789-test.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-testsecret',
        debugMode: 'true', // String instead of boolean
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Debug mode must be a boolean, converting to boolean');
      expect(result.sanitizedConfig?.debugMode).toBe(true);
    });
  });

  describe('utility methods', () => {
    it('should generate example configuration', () => {
      const exampleConfig = validator.generateExampleConfig();

      expect(exampleConfig.name).toBeDefined();
      expect(exampleConfig.clientId).toBeDefined();
      expect(exampleConfig.clientSecret).toBeDefined();
      expect(exampleConfig.deviceFilter).toBeDefined();
      expect(exampleConfig.customNames).toBeDefined();
    });

    it('should provide configuration help', () => {
      const help = validator.getConfigurationHelp();

      expect(help).toContain('Required Settings');
      expect(help).toContain('Optional Settings');
      expect(help).toContain('Setup Instructions');
    });
  });
});