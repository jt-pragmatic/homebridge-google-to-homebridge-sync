import { Logger } from 'homebridge';
import { IAuthManager, IGoogleHomeApiClient } from '../interfaces';

export interface ConnectionState {
  isConnected: boolean;
  lastSuccessfulConnection: number;
  consecutiveFailures: number;
  nextRetryTime: number;
}

export class ConnectionManager {
  private readonly authManager: IAuthManager;
  private readonly apiClient: IGoogleHomeApiClient;
  private readonly logger: Logger;
  
  private connectionState: ConnectionState = {
    isConnected: false,
    lastSuccessfulConnection: 0,
    consecutiveFailures: 0,
    nextRetryTime: 0,
  };

  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly maxRetryAttempts = 10;
  private readonly baseRetryDelay = 30000; // 30 seconds
  private readonly maxRetryDelay = 300000; // 5 minutes

  constructor(authManager: IAuthManager, apiClient: IGoogleHomeApiClient, logger: Logger) {
    this.authManager = authManager;
    this.apiClient = apiClient;
    this.logger = logger;
  }

  /**
   * Check connection status and attempt reconnection if needed
   */
  async checkConnection(): Promise<boolean> {
    try {
      // Try a simple API call to test connectivity
      const response = await this.apiClient.getDevices();
      
      if (response.success) {
        this.onConnectionSuccess();
        return true;
      } else {
        this.onConnectionFailure(new Error(response.error?.message || 'API call failed'));
        return false;
      }
    } catch (error) {
      this.onConnectionFailure(error as Error);
      return false;
    }
  }

  /**
   * Start automatic reconnection attempts
   */
  startReconnectionAttempts(): void {
    if (this.reconnectTimer) {
      return; // Already running
    }

    this.logger.info('Starting automatic reconnection attempts');
    this.scheduleNextReconnection();
  }

  /**
   * Stop automatic reconnection attempts
   */
  stopReconnectionAttempts(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.logger.info('Stopped automatic reconnection attempts');
    }
  }

  /**
   * Force an immediate reconnection attempt
   */
  async forceReconnection(): Promise<boolean> {
    this.logger.info('Forcing immediate reconnection attempt');
    return await this.attemptReconnection();
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Check if we should attempt operations based on connection state
   */
  shouldAttemptOperation(): boolean {
    // If connected, always attempt
    if (this.connectionState.isConnected) {
      return true;
    }

    // If not connected, only attempt if we haven't exceeded retry limits
    // and enough time has passed since last failure
    const now = Date.now();
    return (
      this.connectionState.consecutiveFailures < this.maxRetryAttempts &&
      now >= this.connectionState.nextRetryTime
    );
  }

  private onConnectionSuccess(): void {
    const wasDisconnected = !this.connectionState.isConnected;
    
    this.connectionState = {
      isConnected: true,
      lastSuccessfulConnection: Date.now(),
      consecutiveFailures: 0,
      nextRetryTime: 0,
    };

    if (wasDisconnected) {
      this.logger.info('Connection restored successfully');
      this.stopReconnectionAttempts();
    }
  }

  private onConnectionFailure(error: Error): void {
    const wasConnected = this.connectionState.isConnected;
    
    this.connectionState.isConnected = false;
    this.connectionState.consecutiveFailures++;
    
    const retryDelay = this.calculateRetryDelay(this.connectionState.consecutiveFailures);
    this.connectionState.nextRetryTime = Date.now() + retryDelay;

    if (wasConnected) {
      this.logger.error('Connection lost:', error.message);
      this.startReconnectionAttempts();
    } else {
      this.logger.warn(
        `Connection attempt ${this.connectionState.consecutiveFailures} failed: ${error.message}. ` +
        `Next retry in ${Math.round(retryDelay / 1000)} seconds`
      );
    }

    if (this.connectionState.consecutiveFailures >= this.maxRetryAttempts) {
      this.logger.error('Maximum retry attempts reached. Stopping automatic reconnection.');
      this.stopReconnectionAttempts();
    }
  }

  private scheduleNextReconnection(): void {
    if (this.connectionState.consecutiveFailures >= this.maxRetryAttempts) {
      return;
    }

    const delay = Math.max(0, this.connectionState.nextRetryTime - Date.now());
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      
      const success = await this.attemptReconnection();
      
      if (!success && this.connectionState.consecutiveFailures < this.maxRetryAttempts) {
        this.scheduleNextReconnection();
      }
    }, delay);
  }

  private async attemptReconnection(): Promise<boolean> {
    try {
      this.logger.debug('Attempting reconnection...');
      
      // First, try to refresh authentication tokens
      if (!this.authManager.isAuthenticated()) {
        this.logger.debug('Refreshing authentication tokens...');
        await this.authManager.authenticate();
      }

      // Then test the connection
      return await this.checkConnection();
    } catch (error) {
      this.onConnectionFailure(error as Error);
      return false;
    }
  }

  private calculateRetryDelay(attemptNumber: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = Math.min(
      this.baseRetryDelay * Math.pow(2, attemptNumber - 1),
      this.maxRetryDelay
    );
    
    // Add jitter (±25% of the delay)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    
    return Math.max(this.baseRetryDelay, exponentialDelay + jitter);
  }
}