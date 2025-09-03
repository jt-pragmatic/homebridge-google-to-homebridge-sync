import { IStateSyncManager, IGoogleHomeApiClient, IDeviceManager } from '../interfaces';
import { StateUpdateEvent, DeviceCommand } from '../types';
import { DEFAULT_POLLING_INTERVAL } from '../constants';
import { Logger } from 'homebridge';

export class StateSyncManager implements IStateSyncManager {
  private readonly apiClient: IGoogleHomeApiClient;
  private readonly deviceManager: IDeviceManager;
  private readonly logger: Logger;
  private pollingInterval: number;
  private pollingTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private lastKnownStates: Map<string, Record<string, unknown>> = new Map();

  constructor(
    apiClient: IGoogleHomeApiClient,
    deviceManager: IDeviceManager,
    logger: Logger,
    pollingInterval: number = DEFAULT_POLLING_INTERVAL,
  ) {
    this.apiClient = apiClient;
    this.deviceManager = deviceManager;
    this.logger = logger;
    this.pollingInterval = pollingInterval;
  }

  startPolling(): void {
    if (this.isPolling) {
      this.logger.warn('State polling is already running');
      return;
    }

    this.isPolling = true;
    this.logger.info(`Starting state polling with ${this.pollingInterval}s interval`);
    
    // Start immediate poll, then set up interval
    this.pollDeviceStates();
    
    this.pollingTimer = setInterval(() => {
      this.pollDeviceStates();
    }, this.pollingInterval * 1000);
  }

  stopPolling(): void {
    if (!this.isPolling) {
      return;
    }

    this.isPolling = false;
    
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    this.logger.info('Stopped state polling');
  }

  async handleStateChange(event: StateUpdateEvent): Promise<void> {
    try {
      const { deviceId, state, timestamp } = event;
      
      this.logger.debug(`Handling state change for device ${deviceId}:`, state);
      
      // Update device manager with new state
      await this.deviceManager.updateDeviceState(deviceId, state);
      
      // Update our local cache
      this.lastKnownStates.set(deviceId, { ...state, lastUpdated: timestamp });
      
      this.logger.debug(`State updated for device ${deviceId}`);
    } catch (error) {
      this.logger.error(`Failed to handle state change for device ${event.deviceId}:`, error);
    }
  }

  async sendCommand(deviceId: string, command: string, params: Record<string, unknown>): Promise<void> {
    try {
      this.logger.debug(`Sending command to device ${deviceId}: ${command}`, params);
      
      const deviceCommand: DeviceCommand = { command, params };
      const response = await this.apiClient.executeCommand(deviceId, deviceCommand);
      
      if (response.success) {
        this.logger.debug(`Command sent successfully to device ${deviceId}: ${command}`);
        
        // Trigger immediate state refresh for this device to get updated state
        await this.refreshDeviceState(deviceId);
      } else {
        this.logger.error(`Failed to send command to device ${deviceId}:`, response.error?.message);
        throw new Error(`Command execution failed: ${response.error?.message}`);
      }
    } catch (error) {
      this.logger.error(`Error sending command to device ${deviceId}:`, error);
      throw error;
    }
  }

  async syncAllDeviceStates(): Promise<void> {
    try {
      this.logger.info('Starting full device state synchronization');
      
      const managedDevices = this.deviceManager.getManagedDevices();
      const deviceIds = Array.from(managedDevices.keys());
      
      if (deviceIds.length === 0) {
        this.logger.debug('No devices to synchronize');
        return;
      }
      
      // Get states for all devices in batches to avoid overwhelming the API
      const batchSize = 10;
      const batches = this.createBatches(deviceIds, batchSize);
      
      for (const batch of batches) {
        await this.syncDeviceBatch(batch);
        
        // Small delay between batches to be respectful to the API
        if (batches.length > 1) {
          await this.sleep(1000);
        }
      }
      
      this.logger.info(`Synchronized states for ${deviceIds.length} devices`);
    } catch (error) {
      this.logger.error('Failed to sync all device states:', error);
    }
  }

  setPollingInterval(intervalSeconds: number): void {
    if (intervalSeconds < 5) {
      this.logger.warn('Polling interval too short, minimum is 5 seconds');
      intervalSeconds = 5;
    }
    
    if (intervalSeconds > 300) {
      this.logger.warn('Polling interval too long, maximum is 300 seconds');
      intervalSeconds = 300;
    }
    
    const wasPolling = this.isPolling;
    
    if (wasPolling) {
      this.stopPolling();
    }
    
    this.pollingInterval = intervalSeconds;
    this.logger.info(`Polling interval updated to ${intervalSeconds} seconds`);
    
    if (wasPolling) {
      this.startPolling();
    }
  }

  private async pollDeviceStates(): Promise<void> {
    try {
      this.logger.debug('Polling device states...');
      
      const managedDevices = this.deviceManager.getManagedDevices();
      const deviceIds = Array.from(managedDevices.keys());
      
      if (deviceIds.length === 0) {
        return;
      }
      
      // Get states for all devices
      const response = await this.apiClient.getDeviceStates(deviceIds);
      
      if (response.success && response.data) {
        const stateUpdates: StateUpdateEvent[] = [];
        const currentTime = Date.now();
        
        // Check for state changes
        for (const [deviceId, newState] of Object.entries(response.data)) {
          const lastKnownState = this.lastKnownStates.get(deviceId);
          
          if (this.hasStateChanged(lastKnownState, newState)) {
            stateUpdates.push({
              deviceId,
              state: newState,
              timestamp: currentTime,
            });
          }
        }
        
        // Process state updates
        for (const update of stateUpdates) {
          await this.handleStateChange(update);
        }
        
        if (stateUpdates.length > 0) {
          this.logger.debug(`Processed ${stateUpdates.length} state changes`);
        }
      } else {
        this.logger.warn('Failed to poll device states:', response.error?.message);
      }
    } catch (error) {
      this.logger.error('Error during state polling:', error);
    }
  }

  private async syncDeviceBatch(deviceIds: string[]): Promise<void> {
    try {
      const response = await this.apiClient.getDeviceStates(deviceIds);
      
      if (response.success && response.data) {
        const currentTime = Date.now();
        
        for (const [deviceId, state] of Object.entries(response.data)) {
          const stateUpdate: StateUpdateEvent = {
            deviceId,
            state,
            timestamp: currentTime,
          };
          
          await this.handleStateChange(stateUpdate);
        }
      } else {
        this.logger.warn(`Failed to sync batch of ${deviceIds.length} devices:`, response.error?.message);
      }
    } catch (error) {
      this.logger.error('Error syncing device batch:', error);
    }
  }

  private async refreshDeviceState(deviceId: string): Promise<void> {
    try {
      const response = await this.apiClient.getDeviceState(deviceId);
      
      if (response.success && response.data) {
        const stateUpdate: StateUpdateEvent = {
          deviceId,
          state: response.data,
          timestamp: Date.now(),
        };
        
        await this.handleStateChange(stateUpdate);
      }
    } catch (error) {
      this.logger.error(`Failed to refresh state for device ${deviceId}:`, error);
    }
  }

  private hasStateChanged(
    lastKnownState: Record<string, unknown> | undefined,
    newState: Record<string, unknown>,
  ): boolean {
    if (!lastKnownState) {
      return true; // First time seeing this device state
    }
    
    // Compare relevant state properties (excluding timestamps and metadata)
    const relevantKeys = Object.keys(newState).filter(key => 
      !key.startsWith('_') && key !== 'lastUpdated' && key !== 'timestamp',
    );
    
    for (const key of relevantKeys) {
      if (lastKnownState[key] !== newState[key]) {
        return true;
      }
    }
    
    return false;
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics about state synchronization
   */
  getSyncStatistics(): {
    isPolling: boolean;
    pollingInterval: number;
    cachedStates: number;
    lastPollTime?: number;
    } {
    const lastPollTime = this.lastKnownStates.size > 0 ? 
      Math.max(...Array.from(this.lastKnownStates.values())
        .map(state => (state.lastUpdated as number) || 0)) : undefined;
    
    // Return with explicit typing to avoid strict TypeScript issues
    return {
      isPolling: this.isPolling,
      pollingInterval: this.pollingInterval,
      cachedStates: this.lastKnownStates.size,
      lastPollTime,
    } as {
      isPolling: boolean;
      pollingInterval: number;
      cachedStates: number;
      lastPollTime?: number;
    };
  }

  /**
   * Clear cached states (useful for testing or reset scenarios)
   */
  clearCache(): void {
    this.lastKnownStates.clear();
    this.logger.debug('State cache cleared');
  }

  /**
   * Get cached state for a specific device
   */
  getCachedState(deviceId: string): Record<string, unknown> | undefined {
    return this.lastKnownStates.get(deviceId);
  }

  /**
   * Force refresh of a specific device state
   */
  async forceRefreshDevice(deviceId: string): Promise<void> {
    this.logger.debug(`Force refreshing state for device ${deviceId}`);
    await this.refreshDeviceState(deviceId);
  }
}
