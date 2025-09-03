import { IDeviceManager, IGoogleHomeApiClient } from '../interfaces';
import { GoogleHomeDevice, PluginConfig, DeviceType, DeviceTrait, DeviceLifecycleChanges } from '../types';
import { Logger, Categories } from 'homebridge';
import type { PlatformAccessory } from 'homebridge';

export class DeviceManager implements IDeviceManager {
  private readonly apiClient: IGoogleHomeApiClient;
  private readonly config: PluginConfig;
  private readonly logger: Logger;
  private readonly managedDevices: Map<string, GoogleHomeDevice> = new Map();
  private deviceRefreshTimer?: NodeJS.Timeout;
  private readonly deviceRefreshInterval: number;
  private deviceChangeCallback?: (changes: DeviceLifecycleChanges) => void;

  constructor(apiClient: IGoogleHomeApiClient, config: PluginConfig, logger: Logger) {
    this.apiClient = apiClient;
    this.config = config;
    this.logger = logger;
    // Default to 60 seconds as per requirement 3.4
    this.deviceRefreshInterval = (config.deviceRefreshInterval || 60) * 1000;
  }

  async discoverDevices(): Promise<GoogleHomeDevice[]> {
    try {
      this.logger.info('Starting device discovery...');
      
      const response = await this.apiClient.getDevices();
      
      if (!response.success || !response.data) {
        this.logger.error('Failed to discover devices:', response.error?.message);
        return [];
      }

      const allDevices = response.data;
      this.logger.info(`Found ${allDevices.length} devices from Google Home`);

      // Apply device filtering based on configuration
      const filteredDevices = this.applyDeviceFilters(allDevices);
      this.logger.info(`${filteredDevices.length} devices after filtering`);

      // Update managed devices map
      this.managedDevices.clear();
      filteredDevices.forEach(device => {
        this.managedDevices.set(device.id, device);
      });

      // Log discovered devices
      filteredDevices.forEach(device => {
        this.logger.info(`Discovered device: ${device.name} (${device.type}) - ${device.traits.join(', ')}`);
      });

      return filteredDevices;
    } catch (error) {
      this.logger.error('Error during device discovery:', error);
      return [];
    }
  }

  getAccessoryConfig(device: GoogleHomeDevice): { displayName: string; uuid: string; category: Categories } | null {
    if (!this.isDeviceSupported(device)) {
      this.logger.warn(`Device ${device.name} (${device.type}) is not supported, skipping`);
      return null;
    }

    try {
      // Apply custom naming if configured
      const displayName = this.getDeviceDisplayName(device);
      
      // Generate unique UUID for the accessory
      const uuid = this.generateAccessoryUUID(device);
      
      // Determine HomeKit category based on device type
      const category = this.getHomekitCategory(device);
      
      this.logger.debug(`Generated accessory config for device: ${displayName} (${device.type})`);
      
      return { displayName, uuid, category };
    } catch (error) {
      this.logger.error(`Failed to generate accessory config for device ${device.name}:`, error);
      return null;
    }
  }

  /**
   * Configure an existing PlatformAccessory with device information
   */
  configureAccessory(accessory: PlatformAccessory, device: GoogleHomeDevice): void {
    try {
      // Store device information in accessory context
      accessory.context.device = device;
      accessory.context.deviceId = device.id;
      accessory.context.deviceType = device.type;
      accessory.context.traits = device.traits;
      
      this.logger.debug(`Configured accessory for device: ${device.name} (${device.type})`);
    } catch (error) {
      this.logger.error(`Failed to configure accessory for device ${device.name}:`, error);
    }
  }

  async updateDeviceState(deviceId: string, state: Record<string, unknown>): Promise<void> {
    try {
      const device = this.managedDevices.get(deviceId);
      if (!device) {
        this.logger.warn(`Attempted to update state for unknown device: ${deviceId}`);
        return;
      }

      // Update the device state in our managed devices
      device.state = { ...device.state, ...state };
      this.managedDevices.set(deviceId, device);

      this.logger.debug(`Updated state for device ${device.name}:`, state);
    } catch (error) {
      this.logger.error(`Failed to update device state for ${deviceId}:`, error);
    }
  }

  removeDevice(deviceId: string): void {
    try {
      const device = this.managedDevices.get(deviceId);
      if (device) {
        this.managedDevices.delete(deviceId);
        this.logger.info(`Removed device: ${device.name} (${deviceId})`);
      } else {
        this.logger.warn(`Attempted to remove unknown device: ${deviceId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to remove device ${deviceId}:`, error);
    }
  }

  getManagedDevices(): Map<string, GoogleHomeDevice> {
    return new Map(this.managedDevices);
  }

  isDeviceSupported(device: GoogleHomeDevice): boolean {
    // Check if device type is supported
    const supportedTypes = [
      DeviceType.LIGHT,
      DeviceType.SWITCH,
      DeviceType.OUTLET,
      DeviceType.THERMOSTAT,
      DeviceType.LOCK,
      DeviceType.CAMERA,
      DeviceType.SENSOR,
      DeviceType.FAN,
    ];

    if (!supportedTypes.includes(device.type)) {
      return false;
    }

    // Check if device has at least one supported trait
    const supportedTraits = [
      DeviceTrait.ON_OFF,
      DeviceTrait.BRIGHTNESS,
      DeviceTrait.COLOR_SETTING,
      DeviceTrait.TEMPERATURE_CONTROL,
      DeviceTrait.TEMPERATURE_SETTING,
      DeviceTrait.LOCK_UNLOCK,
      DeviceTrait.CAMERA_STREAM,
      DeviceTrait.SENSOR_STATE,
      DeviceTrait.FAN_SPEED,
    ];

    const hasSupported = device.traits.some(trait => supportedTraits.includes(trait));
    
    if (!hasSupported) {
      this.logger.debug(`Device ${device.name} has no supported traits: ${device.traits.join(', ')}`);
      return false;
    }

    return true;
  }

  private applyDeviceFilters(devices: GoogleHomeDevice[]): GoogleHomeDevice[] {
    let filteredDevices = [...devices];

    const filter = this.config.deviceFilter;
    if (!filter) {
      return filteredDevices;
    }

    // Filter by device types
    if (filter.includeTypes && filter.includeTypes.length > 0) {
      filteredDevices = filteredDevices.filter(device => 
        filter.includeTypes!.includes(device.type),
      );
      this.logger.debug(`Applied includeTypes filter: ${filteredDevices.length} devices remaining`);
    }

    if (filter.excludeTypes && filter.excludeTypes.length > 0) {
      filteredDevices = filteredDevices.filter(device => 
        !filter.excludeTypes!.includes(device.type),
      );
      this.logger.debug(`Applied excludeTypes filter: ${filteredDevices.length} devices remaining`);
    }

    // Filter by rooms
    if (filter.includeRooms && filter.includeRooms.length > 0) {
      filteredDevices = filteredDevices.filter(device => 
        device.roomHint && filter.includeRooms!.includes(device.roomHint),
      );
      this.logger.debug(`Applied includeRooms filter: ${filteredDevices.length} devices remaining`);
    }

    if (filter.excludeRooms && filter.excludeRooms.length > 0) {
      filteredDevices = filteredDevices.filter(device => 
        !device.roomHint || !filter.excludeRooms!.includes(device.roomHint),
      );
      this.logger.debug(`Applied excludeRooms filter: ${filteredDevices.length} devices remaining`);
    }

    return filteredDevices;
  }

  private getDeviceDisplayName(device: GoogleHomeDevice): string {
    // Check for custom name in configuration
    if (this.config.customNames && this.config.customNames[device.id]) {
      return this.config.customNames[device.id];
    }

    // Use device name, fallback to ID if name is empty
    return device.name || `Device ${device.id}`;
  }

  private generateAccessoryUUID(device: GoogleHomeDevice): string {
    // Create a consistent UUID based on device ID
    // This ensures the same device always gets the same UUID
    const crypto = require('crypto');
    return crypto.createHash('sha1')
      .update(`${this.config.name}-${device.id}`)
      .digest('hex')
      .substr(0, 32)
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  }

  private getHomekitCategory(device: GoogleHomeDevice): Categories {
    switch (device.type) {
    case DeviceType.LIGHT:
      return Categories.LIGHTBULB;
    case DeviceType.SWITCH:
      return Categories.SWITCH;
    case DeviceType.OUTLET:
      return Categories.OUTLET;
    case DeviceType.THERMOSTAT:
      return Categories.THERMOSTAT;
    case DeviceType.LOCK:
      return Categories.DOOR_LOCK;
    case DeviceType.CAMERA:
      return Categories.SECURITY_SYSTEM; // or Categories.IP_CAMERA if available
    case DeviceType.SENSOR:
      return Categories.SENSOR;
    case DeviceType.FAN:
      return Categories.FAN;
    default:
      return Categories.OTHER;
    }
  }



  /**
   * Get device statistics for logging/debugging
   */
  getDeviceStatistics(): { total: number; byType: Record<string, number>; byRoom: Record<string, number> } {
    const devices = Array.from(this.managedDevices.values());
    const byType: Record<string, number> = {};
    const byRoom: Record<string, number> = {};

    devices.forEach(device => {
      // Count by type
      byType[device.type] = (byType[device.type] || 0) + 1;
      
      // Count by room
      const room = device.roomHint || 'Unknown';
      byRoom[room] = (byRoom[room] || 0) + 1;
    });

    return {
      total: devices.length,
      byType,
      byRoom,
    };
  }

  /**
   * Refresh device states from Google Home API
   */
  async refreshDeviceStates(): Promise<void> {
    try {
      const deviceIds = Array.from(this.managedDevices.keys());
      if (deviceIds.length === 0) {
        return;
      }

      this.logger.debug(`Refreshing states for ${deviceIds.length} devices`);
      
      const response = await this.apiClient.getDeviceStates(deviceIds);
      
      if (response.success && response.data) {
        for (const [deviceId, state] of Object.entries(response.data)) {
          await this.updateDeviceState(deviceId, state);
        }
        this.logger.debug('Device states refreshed successfully');
      } else {
        this.logger.warn('Failed to refresh device states:', response.error?.message);
      }
    } catch (error) {
      this.logger.error('Error refreshing device states:', error);
    }
  }

  /**
   * Start periodic device list refresh to detect additions/removals
   */
  startDeviceLifecycleMonitoring(): void {
    if (this.deviceRefreshTimer) {
      this.logger.debug('Device lifecycle monitoring already started');
      return;
    }

    this.logger.info(`Starting device lifecycle monitoring with ${this.deviceRefreshInterval / 1000}s interval`);
    
    this.deviceRefreshTimer = setInterval(async () => {
      try {
        await this.checkForDeviceChanges();
      } catch (error) {
        this.logger.error('Error during device lifecycle check:', error);
      }
    }, this.deviceRefreshInterval);
  }

  /**
   * Stop periodic device list refresh
   */
  stopDeviceLifecycleMonitoring(): void {
    if (this.deviceRefreshTimer) {
      clearInterval(this.deviceRefreshTimer);
      this.deviceRefreshTimer = undefined as any;
      this.logger.info('Stopped device lifecycle monitoring');
    }
  }

  /**
   * Set callback for device lifecycle changes
   */
  setDeviceChangeCallback(callback: (changes: DeviceLifecycleChanges) => void): void {
    this.deviceChangeCallback = callback;
  }

  /**
   * Check for device additions, removals, and updates
   */
  async checkForDeviceChanges(): Promise<DeviceLifecycleChanges> {
    try {
      this.logger.debug('Checking for device changes...');
      
      // Get current devices from Google Home
      const response = await this.apiClient.getDevices();
      
      if (!response.success || !response.data) {
        this.logger.warn('Failed to check for device changes:', response.error?.message);
        return { added: [], removed: [], updated: [] };
      }

      const currentDevices = this.applyDeviceFilters(response.data);
      const currentDeviceMap = new Map(currentDevices.map(device => [device.id, device]));
      
      // Find changes
      const changes = this.detectDeviceChanges(currentDeviceMap);
      
      // Log changes if any
      if (changes.added.length > 0 || changes.removed.length > 0 || changes.updated.length > 0) {
        this.logger.info(`Device changes detected: ${changes.added.length} added, ${changes.removed.length} removed, ${changes.updated.length} updated`);
        
        // Log details
        changes.added.forEach(device => {
          this.logger.info(`Device added: ${device.name} (${device.id})`);
        });
        
        changes.removed.forEach(deviceId => {
          const device = this.managedDevices.get(deviceId);
          this.logger.info(`Device removed: ${device?.name || 'Unknown'} (${deviceId})`);
        });
        
        changes.updated.forEach(device => {
          this.logger.debug(`Device updated: ${device.name} (${device.id})`);
        });

        // Update managed devices
        this.applyDeviceChanges(changes);

        // Notify callback if set
        if (this.deviceChangeCallback) {
          this.deviceChangeCallback(changes);
        }
      } else {
        this.logger.debug('No device changes detected');
      }

      return changes;
    } catch (error) {
      this.logger.error('Error checking for device changes:', error);
      return { added: [], removed: [], updated: [] };
    }
  }

  /**
   * Detect changes between current and new device lists
   */
  private detectDeviceChanges(newDeviceMap: Map<string, GoogleHomeDevice>): DeviceLifecycleChanges {
    const added: GoogleHomeDevice[] = [];
    const removed: string[] = [];
    const updated: GoogleHomeDevice[] = [];

    // Find added and updated devices
    for (const [deviceId, newDevice] of newDeviceMap.entries()) {
      const existingDevice = this.managedDevices.get(deviceId);
      
      if (!existingDevice) {
        // New device
        added.push(newDevice);
      } else {
        // Check if device has been updated (name, traits, or attributes changed)
        if (this.hasDeviceChanged(existingDevice, newDevice)) {
          updated.push(newDevice);
        }
      }
    }

    // Find removed devices
    for (const deviceId of this.managedDevices.keys()) {
      if (!newDeviceMap.has(deviceId)) {
        removed.push(deviceId);
      }
    }

    return { added, removed, updated };
  }

  /**
   * Check if a device has meaningful changes
   */
  private hasDeviceChanged(oldDevice: GoogleHomeDevice, newDevice: GoogleHomeDevice): boolean {
    // Check name change
    if (oldDevice.name !== newDevice.name) {
      return true;
    }

    // Check traits change
    if (oldDevice.traits.length !== newDevice.traits.length ||
        !oldDevice.traits.every(trait => newDevice.traits.includes(trait))) {
      return true;
    }

    // Check room change
    if (oldDevice.roomHint !== newDevice.roomHint) {
      return true;
    }

    // Check manufacturer info change
    if (JSON.stringify(oldDevice.manufacturerInfo) !== JSON.stringify(newDevice.manufacturerInfo)) {
      return true;
    }

    // Check attributes change (only structural changes, not state)
    if (JSON.stringify(oldDevice.attributes) !== JSON.stringify(newDevice.attributes)) {
      return true;
    }

    return false;
  }

  /**
   * Apply detected changes to managed devices
   */
  private applyDeviceChanges(changes: DeviceLifecycleChanges): void {
    // Add new devices
    changes.added.forEach(device => {
      this.managedDevices.set(device.id, device);
    });

    // Remove deleted devices
    changes.removed.forEach(deviceId => {
      this.managedDevices.delete(deviceId);
    });

    // Update changed devices
    changes.updated.forEach(device => {
      this.managedDevices.set(device.id, device);
    });
  }

  /**
   * Force a device list refresh and return changes
   */
  async forceDeviceRefresh(): Promise<DeviceLifecycleChanges> {
    this.logger.info('Forcing device list refresh...');
    return await this.checkForDeviceChanges();
  }
}