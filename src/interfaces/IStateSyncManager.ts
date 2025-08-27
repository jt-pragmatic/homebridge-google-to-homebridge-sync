import { StateUpdateEvent } from '../types';

export interface IStateSyncManager {
  /**
   * Start polling for state changes from Google Home
   */
  startPolling(): void;

  /**
   * Stop polling for state changes
   */
  stopPolling(): void;

  /**
   * Handle a state change event from Google Home
   */
  handleStateChange(event: StateUpdateEvent): Promise<void>;

  /**
   * Send a command from HomeKit to Google Home
   */
  sendCommand(deviceId: string, command: string, params: Record<string, unknown>): Promise<void>;

  /**
   * Force sync all device states
   */
  syncAllDeviceStates(): Promise<void>;

  /**
   * Set polling interval in seconds
   */
  setPollingInterval(intervalSeconds: number): void;
}