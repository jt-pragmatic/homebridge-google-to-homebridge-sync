import { Logger } from 'homebridge';
import { DeviceState } from '../types';

export interface CachedDeviceState extends DeviceState {
  lastUpdated: number;
  isStale: boolean;
}

export class DeviceStateCache {
  private readonly cache: Map<string, CachedDeviceState> = new Map();
  private readonly logger: Logger;
  private readonly staleThreshold: number; // milliseconds

  constructor(logger: Logger, staleThresholdMinutes: number = 10) {
    this.logger = logger;
    this.staleThreshold = staleThresholdMinutes * 60 * 1000;
  }

  /**
   * Store device state in cache
   */
  setDeviceState(deviceId: string, state: DeviceState): void {
    const cachedState: CachedDeviceState = {
      ...state,
      lastUpdated: Date.now(),
      isStale: false,
    };

    this.cache.set(deviceId, cachedState);
    this.logger.debug(`Cached state for device ${deviceId}`);
  }

  /**
   * Get cached device state
   */
  getDeviceState(deviceId: string): CachedDeviceState | null {
    const cachedState = this.cache.get(deviceId);
    
    if (!cachedState) {
      return null;
    }

    // Check if state is stale
    const now = Date.now();
    const isStale = (now - cachedState.lastUpdated) > this.staleThreshold;
    
    if (isStale && !cachedState.isStale) {
      // Mark as stale but keep the data
      cachedState.isStale = true;
      this.cache.set(deviceId, cachedState);
      this.logger.debug(`Device ${deviceId} state marked as stale`);
    }

    return cachedState;
  }

  /**
   * Get all cached device states
   */
  getAllDeviceStates(): Map<string, CachedDeviceState> {
    const now = Date.now();
    const result = new Map<string, CachedDeviceState>();

    for (const [deviceId, state] of this.cache.entries()) {
      const isStale = (now - state.lastUpdated) > this.staleThreshold;
      
      if (isStale && !state.isStale) {
        state.isStale = true;
        this.cache.set(deviceId, state);
      }

      result.set(deviceId, { ...state });
    }

    return result;
  }

  /**
   * Check if device state exists in cache
   */
  hasDeviceState(deviceId: string): boolean {
    return this.cache.has(deviceId);
  }

  /**
   * Remove device state from cache
   */
  removeDeviceState(deviceId: string): boolean {
    const removed = this.cache.delete(deviceId);
    if (removed) {
      this.logger.debug(`Removed cached state for device ${deviceId}`);
    }
    return removed;
  }

  /**
   * Clear all cached states
   */
  clearCache(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.logger.info(`Cleared ${count} cached device states`);
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    totalDevices: number;
    freshStates: number;
    staleStates: number;
    oldestStateAge: number;
    newestStateAge: number;
    } {
    const now = Date.now();
    let freshCount = 0;
    let staleCount = 0;
    let oldestAge = 0;
    let newestAge = Infinity;

    for (const state of this.cache.values()) {
      const age = now - state.lastUpdated;
      
      if (state.isStale || age > this.staleThreshold) {
        staleCount++;
      } else {
        freshCount++;
      }

      oldestAge = Math.max(oldestAge, age);
      newestAge = Math.min(newestAge, age);
    }

    return {
      totalDevices: this.cache.size,
      freshStates: freshCount,
      staleStates: staleCount,
      oldestStateAge: oldestAge,
      newestStateAge: newestAge === Infinity ? 0 : newestAge,
    };
  }

  /**
   * Clean up stale entries older than specified age
   */
  cleanupStaleEntries(maxAgeMinutes: number = 60): number {
    const maxAge = maxAgeMinutes * 60 * 1000;
    const now = Date.now();
    let removedCount = 0;

    for (const [deviceId, state] of this.cache.entries()) {
      if ((now - state.lastUpdated) > maxAge) {
        this.cache.delete(deviceId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.info(`Cleaned up ${removedCount} stale cache entries`);
    }

    return removedCount;
  }

  /**
   * Update multiple device states at once
   */
  setMultipleDeviceStates(states: Record<string, DeviceState>): void {
    const now = Date.now();
    let updateCount = 0;

    for (const [deviceId, state] of Object.entries(states)) {
      const cachedState: CachedDeviceState = {
        ...state,
        lastUpdated: now,
        isStale: false,
      };

      this.cache.set(deviceId, cachedState);
      updateCount++;
    }

    this.logger.debug(`Cached states for ${updateCount} devices`);
  }

  /**
   * Get devices with stale states
   */
  getStaleDevices(): string[] {
    const staleDevices: string[] = [];
    const now = Date.now();

    for (const [deviceId, state] of this.cache.entries()) {
      if (state.isStale || (now - state.lastUpdated) > this.staleThreshold) {
        staleDevices.push(deviceId);
      }
    }

    return staleDevices;
  }

  /**
   * Refresh stale state markers (useful after successful sync)
   */
  refreshStaleMarkers(): void {
    let refreshedCount = 0;

    for (const [deviceId, state] of this.cache.entries()) {
      if (state.isStale) {
        state.isStale = false;
        this.cache.set(deviceId, state);
        refreshedCount++;
      }
    }

    if (refreshedCount > 0) {
      this.logger.debug(`Refreshed stale markers for ${refreshedCount} devices`);
    }
  }
}