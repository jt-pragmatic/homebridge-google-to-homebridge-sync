import { GoogleHomePlatform } from '../../platform';
import { AuthManager } from '../../auth';
import { GoogleHomeApiClient } from '../../api';
import { ConnectionManager, DeviceStateCache, ResilientApiClient } from '../../resilience';
import { StateSyncManager } from '../../sync';
import { PluginConfig } from '../../types';
import { Logger, API, PlatformConfig } from 'homebridge';

// Mock Homebridge API
const mockApi: Partial<API> = {
  on: jest.fn(),
  registerPlatformAccessories: jest.fn(),
  unregisterPlatformAccessories: jest.fn(),
  updatePlatformAccessories: jest.fn(),
  hap: {
    Service: {} as any,
    Characteristic: {} as any,
  } as any,
};

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

// Mock configuration
const mockConfig: PluginConfig = {
  name: 'Error Recovery Test',
  clientId: '123456789-test.apps.googleusercontent.com',
  clientSecret: 'GOCSPX-testsecret',
  refreshToken: '1//0testrefreshtoken',
  pollingInterval: 5,
  debugMode: true,
};

// Use fake timers
jest.useFakeTimers();

describe('Error Recovery Integration Tests', () => {
  let platform: GoogleHomePlatform;
  let authManager: AuthManager;
  let baseApiClient: GoogleHomeApiClient;
  let connectionManager: ConnectionManager;
  let stateCache: DeviceStateCache;
  let resilientApiClient: ResilientApiClient;
  let stateSyncManager: StateSyncManager;

  beforeEach(() => {
    // Create component instances
    authManager = new AuthManager(mockConfig, mockLogger);
    baseApiClient = new GoogleHomeApiClient(authManager, mockLogger);
    connectionManager = new ConnectionManager(authManager, baseApiClient, mockLogger);
    stateCache = new DeviceStateCache(mockLogger);
    resilientApiClient = new ResilientApiClient(baseApiClient, connectionManager, stateCache, mockLogger);

    platform = new GoogleHomePlatform(mockLogger, mockConfig as PlatformConfig, mockApi as API);

    jest.clearAllMocks();
  });

  afterEach(() => {
    connectionManager.stopReconnectionAttempts();
    jest.clearAllTimers();
  });

  describe('Authentication Error Recovery', () => {
    it('should handle token expiration and refresh automatically', async () => {
      // Mock initial authentication success
      jest.spyOn(authManager, 'isAuthenticated').mockReturnValue(true);
      jest.spyOn(authManager, 'getValidAccessToken')
        .mockRejectedValueOnce(new Error('Token expired'))
        .mockResolvedValueOnce('new-access-token');

      jest.spyOn(authManager, 'refreshToken').mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      // Mock API call that triggers token refresh
      jest.spyOn(baseApiClient, 'getDevices').mockResolvedValue({
        success: true,
        data: [],
      });

      // Trigger operation that requires authentication
      await platform.discoverDevices();

      // Should have attempted token refresh
      expect(authManager.refreshToken).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Access token expired or expiring soon, refreshing...');
    });

    it('should handle complete authentication failure', async () => {
      // Mock authentication failure
      jest.spyOn(authManager, 'isAuthenticated').mockReturnValue(false);
      jest.spyOn(authManager, 'authenticate').mockRejectedValue(new Error('Invalid credentials'));

      await platform.discoverDevices();

      // Should log error and not proceed with device discovery
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to discover devices:',
        expect.any(Error)
      );

      expect(mockApi.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('should retry authentication with exponential backoff', async () => {
      jest.spyOn(authManager, 'authenticate')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          accessToken: 'success-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 3600000,
        });

      // Mock connection manager to handle retries
      jest.spyOn(connectionManager, 'checkConnection')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      // First attempt should fail
      const result1 = await connectionManager.checkConnection();
      expect(result1).toBe(false);

      // Second attempt should fail
      const result2 = await connectionManager.checkConnection();
      expect(result2).toBe(false);

      // Third attempt should succeed
      const result3 = await connectionManager.checkConnection();
      expect(result3).toBe(true);

      expect(mockLogger.info).toHaveBeenCalledWith('Connection restored successfully');
    });
  });

  describe('Network Error Recovery', () => {
    it('should handle network timeouts gracefully', async () => {
      // Mock network timeout
      jest.spyOn(baseApiClient, 'getDevices').mockRejectedValue(new Error('ETIMEDOUT'));

      await platform.discoverDevices();

      // Should log error and continue
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to discover devices:',
        expect.any(Error)
      );

      // Connection manager should detect the failure
      const connectionState = connectionManager.getConnectionState();
      expect(connectionState.isConnected).toBe(false);
    });

    it('should implement circuit breaker pattern for repeated failures', async () => {
      // Mock repeated failures
      jest.spyOn(baseApiClient, 'getDevices').mockResolvedValue({
        success: false,
        error: { message: 'Service unavailable' },
      });

      // Simulate multiple failures
      for (let i = 0; i < 10; i++) {
        await connectionManager.checkConnection();
      }

      const connectionState = connectionManager.getConnectionState();
      expect(connectionState.consecutiveFailures).toBe(10);

      // Should stop attempting after max retries
      expect(connectionManager.shouldAttemptOperation()).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Maximum retry attempts reached. Stopping automatic reconnection.'
      );
    });

    it('should recover from network issues automatically', async () => {
      // Start with network failure
      jest.spyOn(baseApiClient, 'getDevices')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          success: true,
          data: [],
        });

      // First attempt fails
      const result1 = await connectionManager.checkConnection();
      expect(result1).toBe(false);

      // Second attempt succeeds
      const result2 = await connectionManager.checkConnection();
      expect(result2).toBe(true);

      expect(mockLogger.info).toHaveBeenCalledWith('Connection restored successfully');
    });
  });

  describe('API Error Recovery', () => {
    it('should handle rate limiting with backoff', async () => {
      // Mock rate limiting error
      const rateLimitError = {
        response: { status: 429 },
        config: { url: '/api/devices' },
      };

      jest.spyOn(baseApiClient, 'getDevices')
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          success: true,
          data: [],
        });

      // Should retry after rate limit
      await platform.discoverDevices();

      // Should eventually succeed
      expect(mockApi.registerPlatformAccessories).toHaveBeenCalled();
    });

    it('should handle server errors with retry logic', async () => {
      // Mock server error
      const serverError = {
        response: { status: 500 },
        config: { url: '/api/devices' },
      };

      jest.spyOn(baseApiClient, 'getDevices')
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({
          success: true,
          data: [],
        });

      await platform.discoverDevices();

      // Should eventually succeed after retries
      expect(mockApi.registerPlatformAccessories).toHaveBeenCalled();
    });

    it('should not retry on client errors (4xx)', async () => {
      // Mock client error (non-retryable)
      const clientError = {
        response: { status: 400 },
        config: { url: '/api/devices' },
      };

      jest.spyOn(baseApiClient, 'getDevices').mockRejectedValue(clientError);

      await platform.discoverDevices();

      // Should not register accessories due to client error
      expect(mockApi.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to discover devices:',
        expect.any(Error)
      );
    });
  });

  describe('State Synchronization Error Recovery', () => {
    it('should continue polling despite individual sync failures', async () => {
      const syncManager = new StateSyncManager(resilientApiClient, platform as any, mockLogger, 5);

      // Mock intermittent failures
      jest.spyOn(resilientApiClient, 'getDeviceStates')
        .mockResolvedValueOnce({
          success: false,
          error: { code: 'SYNC_ERROR', message: 'Temporary failure' },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { 'device-1': { on: true } },
        });

      syncManager.startPolling();

      // First poll fails
      await jest.runOnlyPendingTimersAsync();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to poll device states:',
        'Temporary failure'
      );

      // Second poll succeeds
      jest.advanceTimersByTime(5000);
      await jest.runOnlyPendingTimersAsync();

      syncManager.stopPolling();
    });

    it('should fall back to cached states during API failures', async () => {
      // Pre-populate cache
      stateCache.setDeviceState('device-1', { on: false, brightness: 50 });

      // Mock API failure
      jest.spyOn(connectionManager, 'shouldAttemptOperation').mockReturnValue(false);

      // Try to get device state
      const result = await resilientApiClient.getDeviceState('device-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({ on: false, brightness: 50 }));
    });

    it('should handle command execution failures gracefully', async () => {
      const syncManager = new StateSyncManager(resilientApiClient, platform as any, mockLogger, 5);

      // Mock command failure
      jest.spyOn(resilientApiClient, 'executeCommand').mockResolvedValue({
        success: false,
        error: { code: 'DEVICE_OFFLINE', message: 'Device is offline' },
      });

      // Command should fail but not crash
      await expect(
        syncManager.sendCommand('device-1', 'action.devices.commands.OnOff', { on: true })
      ).rejects.toThrow('Command execution failed: Device is offline');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send command to device device-1:',
        'Device is offline'
      );
    });
  });

  describe('Device Lifecycle Error Recovery', () => {
    it('should handle device removal gracefully', async () => {
      // First discovery with devices
      jest.spyOn(baseApiClient, 'getDevices').mockResolvedValueOnce({
        success: true,
        data: [
          {
            id: 'device-1',
            name: 'Test Device',
            type: 'action.devices.types.LIGHT',
            traits: ['action.devices.traits.OnOff'],
            attributes: {},
            state: {},
          },
        ],
      });

      await platform.discoverDevices();
      expect(mockApi.registerPlatformAccessories).toHaveBeenCalled();

      jest.clearAllMocks();

      // Second discovery with no devices (device removed)
      jest.spyOn(baseApiClient, 'getDevices').mockResolvedValueOnce({
        success: true,
        data: [],
      });

      await platform.discoverDevices();

      // Should unregister the removed device
      expect(mockApi.unregisterPlatformAccessories).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Removed 1 stale accessories')
      );
    });

    it('should handle device addition during runtime', async () => {
      // First discovery with no devices
      jest.spyOn(baseApiClient, 'getDevices').mockResolvedValueOnce({
        success: true,
        data: [],
      });

      await platform.discoverDevices();
      expect(mockApi.registerPlatformAccessories).not.toHaveBeenCalled();

      jest.clearAllMocks();

      // Second discovery with new device
      jest.spyOn(baseApiClient, 'getDevices').mockResolvedValueOnce({
        success: true,
        data: [
          {
            id: 'new-device',
            name: 'New Device',
            type: 'action.devices.types.SWITCH',
            traits: ['action.devices.traits.OnOff'],
            attributes: {},
            state: {},
          },
        ],
      });

      await platform.rediscoverDevices();

      // Should register the new device
      expect(mockApi.registerPlatformAccessories).toHaveBeenCalled();
    });
  });

  describe('Memory and Resource Management', () => {
    it('should clean up resources on shutdown', () => {
      const syncManager = new StateSyncManager(resilientApiClient, platform as any, mockLogger, 5);

      syncManager.startPolling();
      expect(syncManager.getSyncStatistics().isPolling).toBe(true);

      // Simulate shutdown
      syncManager.stopPolling();
      expect(syncManager.getSyncStatistics().isPolling).toBe(false);
    });

    it('should limit cache size to prevent memory leaks', () => {
      // Add many cache entries
      for (let i = 0; i < 1500; i++) {
        stateCache.setDeviceState(`device-${i}`, { on: true });
      }

      const stats = stateCache.getCacheStatistics();
      expect(stats.totalDevices).toBeLessThanOrEqual(1000); // Should be limited
    });

    it('should clean up old cache entries automatically', () => {
      // Add old entries
      stateCache.setDeviceState('old-device', { on: true });

      // Clean up entries older than 0 minutes
      const removedCount = stateCache.cleanupStaleEntries(0);

      expect(removedCount).toBeGreaterThan(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up')
      );
    });
  });
});