import { IGoogleHomeApiClient, IAuthManager } from '../interfaces';
import { GoogleHomeDevice, DeviceCommand, DeviceState, ApiResponse, GoogleHomeApiDevice, DeviceType, DeviceTrait } from '../types';
import { GOOGLE_SMART_HOME_API_URL, MAX_RETRY_ATTEMPTS, DEFAULT_RETRY_DELAY } from '../constants';
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { Logger } from 'homebridge';

export class GoogleHomeApiClient implements IGoogleHomeApiClient {
  private readonly authManager: IAuthManager;
  private readonly logger: Logger;
  private readonly httpClient: AxiosInstance;
  private readonly maxRetries: number;
  private readonly baseRetryDelay: number;

  constructor(authManager: IAuthManager, logger: Logger) {
    this.authManager = authManager;
    this.logger = logger;
    this.maxRetries = MAX_RETRY_ATTEMPTS;
    this.baseRetryDelay = DEFAULT_RETRY_DELAY;

    this.httpClient = axios.create({
      baseURL: GOOGLE_SMART_HOME_API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.httpClient.interceptors.request.use(async (config) => {
      try {
        const token = await this.authManager.getValidAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      } catch (error) {
        this.logger.error('Failed to get access token for API request:', error);
        throw error;
      }
    });

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        this.logger.error('API request failed:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url,
        });
        return Promise.reject(error);
      },
    );
  }

  async getDevices(): Promise<ApiResponse<GoogleHomeDevice[]>> {
    return this.executeWithRetry(async () => {
      try {
        // Note: This endpoint may vary based on the actual Google Smart Home API
        // For Device Access API, it would be something like:
        // GET https://smartdevicemanagement.googleapis.com/v1/enterprises/{enterprise_id}/devices
        const response: AxiosResponse = await this.httpClient.get('/devices');
        
        const devices = this.mapApiDevicesToGoogleHomeDevices(response.data.devices || []);
        
        this.logger.info(`Retrieved ${devices.length} devices from Google Home`);
        
        return {
          success: true,
          data: devices,
        };
      } catch (error) {
        this.logger.error('Failed to retrieve devices:', error);
        return {
          success: false,
          error: {
            code: 'DEVICE_RETRIEVAL_FAILED',
            message: 'Failed to retrieve devices from Google Home',
            details: error,
          },
        };
      }
    });
  }

  async getDeviceState(deviceId: string): Promise<ApiResponse<DeviceState>> {
    return this.executeWithRetry(async () => {
      try {
        const response: AxiosResponse = await this.httpClient.get(`/devices/${deviceId}/state`);
        
        const state: DeviceState = {
          online: response.data.online ?? true,
          ...response.data,
        };
        
        this.logger.debug(`Retrieved state for device ${deviceId}:`, state);
        
        return {
          success: true,
          data: state,
        };
      } catch (error) {
        this.logger.error(`Failed to get state for device ${deviceId}:`, error);
        return {
          success: false,
          error: {
            code: 'DEVICE_STATE_FAILED',
            message: `Failed to get state for device ${deviceId}`,
            details: error,
          },
        };
      }
    });
  }

  async executeCommand(deviceId: string, command: DeviceCommand): Promise<ApiResponse<void>> {
    return this.executeWithRetry(async () => {
      try {
        const payload = {
          requestId: this.generateRequestId(),
          inputs: [{
            intent: 'action.devices.EXECUTE',
            payload: {
              commands: [{
                devices: [{ id: deviceId }],
                execution: [{
                  command: command.command,
                  params: command.params,
                }],
              }],
            },
          }],
        };

        await this.httpClient.post('/devices:executeCommand', payload);
        
        this.logger.debug(`Executed command ${command.command} on device ${deviceId}`);
        
        return {
          success: true,
        };
      } catch (error) {
        this.logger.error(`Failed to execute command on device ${deviceId}:`, error);
        return {
          success: false,
          error: {
            code: 'COMMAND_EXECUTION_FAILED',
            message: `Failed to execute command on device ${deviceId}`,
            details: error,
          },
        };
      }
    });
  }

  async getDeviceStates(deviceIds: string[]): Promise<ApiResponse<Record<string, DeviceState>>> {
    return this.executeWithRetry(async () => {
      try {
        const payload = {
          requestId: this.generateRequestId(),
          inputs: [{
            intent: 'action.devices.QUERY',
            payload: {
              devices: deviceIds.map(id => ({ id })),
            },
          }],
        };

        const response: AxiosResponse = await this.httpClient.post('/devices:query', payload);
        
        const states: Record<string, DeviceState> = {};
        const devices = response.data.payload?.devices || {};

        for (const [deviceId, deviceData] of Object.entries(devices)) {
          const device = deviceData as Record<string, unknown>;
          states[deviceId] = {
            online: (device.online as boolean) ?? true,
            ...device,
          };
        }
        
        this.logger.debug(`Retrieved states for ${deviceIds.length} devices`);
        
        return {
          success: true,
          data: states,
        };
      } catch (error) {
        this.logger.error('Failed to get device states:', error);
        return {
          success: false,
          error: {
            code: 'DEVICE_STATES_FAILED',
            message: 'Failed to get device states',
            details: error,
          },
        };
      }
    });
  }

  async executeCommands(commands: Array<{ deviceId: string; command: DeviceCommand }>): Promise<ApiResponse<void>> {
    return this.executeWithRetry(async () => {
      try {
        const payload = {
          requestId: this.generateRequestId(),
          inputs: [{
            intent: 'action.devices.EXECUTE',
            payload: {
              commands: commands.map(({ deviceId, command }) => ({
                devices: [{ id: deviceId }],
                execution: [{
                  command: command.command,
                  params: command.params,
                }],
              })),
            },
          }],
        };

        await this.httpClient.post('/devices:executeCommand', payload);
        
        this.logger.debug(`Executed ${commands.length} commands`);
        
        return {
          success: true,
        };
      } catch (error) {
        this.logger.error('Failed to execute commands:', error);
        return {
          success: false,
          error: {
            code: 'COMMANDS_EXECUTION_FAILED',
            message: 'Failed to execute commands',
            details: error,
          },
        };
      }
    });
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.maxRetries) {
          break;
        }

        // Check if error is retryable
        if (this.isRetryableError(error as AxiosError)) {
          const delay = this.calculateRetryDelay(attempt);
          this.logger.warn(`API request failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms:`, error);
          await this.sleep(delay);
        } else {
          // Non-retryable error, fail immediately
          throw error;
        }
      }
    }
    
    throw lastError;
  }

  private isRetryableError(error: AxiosError): boolean {
    if (!error.response) {
      // Network errors are retryable
      return true;
    }

    const status = error.response.status;
    // Retry on server errors and rate limiting
    return status >= 500 || status === 429;
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = this.baseRetryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateRequestId(): string {
    return `homebridge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private mapApiDevicesToGoogleHomeDevices(apiDevices: GoogleHomeApiDevice[]): GoogleHomeDevice[] {
    return apiDevices.map(apiDevice => ({
      id: apiDevice.id,
      name: apiDevice.name.name || apiDevice.name.defaultNames[0] || 'Unknown Device',
      type: this.mapDeviceType(apiDevice.type),
      traits: apiDevice.traits.map(trait => this.mapDeviceTrait(trait)),
      attributes: apiDevice.attributes || {},
      state: {}, // State will be populated separately
      ...(apiDevice.roomHint && { roomHint: apiDevice.roomHint }),
      ...(apiDevice.deviceInfo && {
        manufacturerInfo: {
          manufacturer: apiDevice.deviceInfo.manufacturer,
          model: apiDevice.deviceInfo.model,
        },
      }),
      ...(apiDevice.customData && { customData: apiDevice.customData }),
    }));
  }

  private mapDeviceType(apiType: string): DeviceType {
    // Map API device types to our enum
    switch (apiType) {
    case 'action.devices.types.LIGHT':
      return DeviceType.LIGHT;
    case 'action.devices.types.SWITCH':
      return DeviceType.SWITCH;
    case 'action.devices.types.OUTLET':
      return DeviceType.OUTLET;
    case 'action.devices.types.THERMOSTAT':
      return DeviceType.THERMOSTAT;
    case 'action.devices.types.LOCK':
      return DeviceType.LOCK;
    case 'action.devices.types.CAMERA':
      return DeviceType.CAMERA;
    case 'action.devices.types.SENSOR':
      return DeviceType.SENSOR;
    case 'action.devices.types.FAN':
      return DeviceType.FAN;
    case 'action.devices.types.VACUUM':
      return DeviceType.VACUUM;
    case 'action.devices.types.SPEAKER':
      return DeviceType.SPEAKER;
    default:
      this.logger.warn(`Unknown device type: ${apiType}`);
      return DeviceType.SWITCH; // Default fallback
    }
  }

  private mapDeviceTrait(apiTrait: string): DeviceTrait {
    // Map API device traits to our enum
    switch (apiTrait) {
    case 'action.devices.traits.OnOff':
      return DeviceTrait.ON_OFF;
    case 'action.devices.traits.Brightness':
      return DeviceTrait.BRIGHTNESS;
    case 'action.devices.traits.ColorSetting':
      return DeviceTrait.COLOR_SETTING;
    case 'action.devices.traits.TemperatureControl':
      return DeviceTrait.TEMPERATURE_CONTROL;
    case 'action.devices.traits.TemperatureSetting':
      return DeviceTrait.TEMPERATURE_SETTING;
    case 'action.devices.traits.LockUnlock':
      return DeviceTrait.LOCK_UNLOCK;
    case 'action.devices.traits.CameraStream':
      return DeviceTrait.CAMERA_STREAM;
    case 'action.devices.traits.SensorState':
      return DeviceTrait.SENSOR_STATE;
    case 'action.devices.traits.FanSpeed':
      return DeviceTrait.FAN_SPEED;
    case 'action.devices.traits.StartStop':
      return DeviceTrait.START_STOP;
    case 'action.devices.traits.Volume':
      return DeviceTrait.VOLUME;
    default:
      this.logger.warn(`Unknown device trait: ${apiTrait}`);
      return DeviceTrait.ON_OFF; // Default fallback
    }
  }
}
