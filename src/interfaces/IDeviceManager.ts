import { GoogleHomeDevice, DeviceLifecycleChanges } from '../types';
import type { PlatformAccessory, Categories } from 'homebridge';

export interface IDeviceManager {
  /**
   * Discover and retrieve all Google Home devices
   */
  discoverDevices(): Promise<GoogleHomeDevice[]>;

  /**
   * Get accessory configuration for a Google Home device
   */
  getAccessoryConfig(device: GoogleHomeDevice): { displayName: string; uuid: string; category: Categories } | null;

  /**
   * Configure an existing PlatformAccessory with device information
   */
  configureAccessory(accessory: PlatformAccessory, device: GoogleHomeDevice): void;

  /**
   * Update device state and sync with HomeKit
   */
  updateDeviceState(deviceId: string, state: Record<string, unknown>): Promise<void>;

  /**
   * Remove a device and its corresponding accessory
   */
  removeDevice(deviceId: string): void;

  /**
   * Get all currently managed devices
   */
  getManagedDevices(): Map<string, GoogleHomeDevice>;

  /**
   * Check if a device type is supported
   */
  isDeviceSupported(device: GoogleHomeDevice): boolean;

  /**
   * Start periodic monitoring for device lifecycle changes
   */
  startDeviceLifecycleMonitoring(): void;

  /**
   * Stop periodic monitoring for device lifecycle changes
   */
  stopDeviceLifecycleMonitoring(): void;

  /**
   * Set callback for device lifecycle changes
   */
  setDeviceChangeCallback(callback: (changes: DeviceLifecycleChanges) => void): void;

  /**
   * Check for device changes and return detected changes
   */
  checkForDeviceChanges(): Promise<DeviceLifecycleChanges>;

  /**
   * Force a device list refresh
   */
  forceDeviceRefresh(): Promise<DeviceLifecycleChanges>;
}