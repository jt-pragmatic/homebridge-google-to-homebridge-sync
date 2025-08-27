import { GoogleHomeApiClient } from '../GoogleHomeApiClient';
import { IAuthManager } from '../../interfaces';
import { DeviceType, DeviceTrait } from '../../types';
import { Logger } from 'homebridge';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock auth manager
const mockAuthManager: IAuthManager = {
  authenticate: jest.fn(),
  refreshToken: jest.fn(),
  getValidAccessToken: jest.fn().mockResolvedValue('valid-token'),
  isAuthenticated: jest.fn().mockReturnValue(true),
  clearTokens: jest.fn(),
};

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

// Mock axios instance
const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  interceptors: {
    request: {
      use: jest.fn(),
    },
    response: {
      use: jest.fn(),
    },
  },
};

describe('GoogleHomeApiClient', () => {
  let apiClient: GoogleHomeApiClient;

  beforeEach(() => {
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    apiClient = new GoogleHomeApiClient(mockAuthManager, mockLogger);
    jest.clearAllMocks();
  });

  describe('getDevices', () => {
    it('should successfully retrieve and map devices', async () => {
      const mockApiResponse = {
        data: {
          devices: [
            {
              id: 'device-1',
              type: 'action.devices.types.LIGHT',
              traits: ['action.devices.traits.OnOff', 'action.devices.traits.Brightness'],
              name: {
                name: 'Living Room Light',
                defaultNames: ['Light'],
                nicknames: ['Main Light'],
              },
              attributes: { maxBrightness: 100 },
              roomHint: 'Living Room',
              deviceInfo: {
                manufacturer: 'Philips',
                model: 'Hue Bulb',
                hwVersion: '1.0',
                swVersion: '2.1',
              },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockApiResponse);

      const result = await apiClient.getDevices();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toEqual({
        id: 'device-1',
        name: 'Living Room Light',
        type: DeviceType.LIGHT,
        traits: [DeviceTrait.ON_OFF, DeviceTrait.BRIGHTNESS],
        attributes: { maxBrightness: 100 },
        state: {},
        roomHint: 'Living Room',
        manufacturerInfo: {
          manufacturer: 'Philips',
          model: 'Hue Bulb',
        },
        customData: undefined,
      });
    });

    it('should handle API errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      const result = await apiClient.getDevices();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DEVICE_RETRIEVAL_FAILED');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle empty device list', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: {} });

      const result = await apiClient.getDevices();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('getDeviceState', () => {
    it('should successfully retrieve device state', async () => {
      const mockStateResponse = {
        data: {
          online: true,
          on: true,
          brightness: 80,
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockStateResponse);

      const result = await apiClient.getDeviceState('device-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        online: true,
        on: true,
        brightness: 80,
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/devices/device-1/state');
    });

    it('should handle missing online status', async () => {
      const mockStateResponse = {
        data: {
          on: false,
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockStateResponse);

      const result = await apiClient.getDeviceState('device-1');

      expect(result.success).toBe(true);
      expect(result.data?.online).toBe(true); // Default to true
    });
  });

  describe('executeCommand', () => {
    it('should successfully execute command', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

      const command = {
        command: 'action.devices.commands.OnOff',
        params: { on: true },
      };

      const result = await apiClient.executeCommand('device-1', command);

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/devices:executeCommand',
        expect.objectContaining({
          inputs: expect.arrayContaining([
            expect.objectContaining({
              intent: 'action.devices.EXECUTE',
              payload: expect.objectContaining({
                commands: expect.arrayContaining([
                  expect.objectContaining({
                    devices: [{ id: 'device-1' }],
                    execution: [command],
                  }),
                ]),
              }),
            }),
          ]),
        })
      );
    });
  });

  describe('getDeviceStates', () => {
    it('should successfully retrieve multiple device states', async () => {
      const mockResponse = {
        data: {
          payload: {
            devices: {
              'device-1': { online: true, on: true },
              'device-2': { online: false, on: false },
            },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

      const result = await apiClient.getDeviceStates(['device-1', 'device-2']);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        'device-1': { online: true, on: true },
        'device-2': { online: false, on: false },
      });
    });
  });

  describe('executeCommands', () => {
    it('should successfully execute multiple commands', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

      const commands = [
        {
          deviceId: 'device-1',
          command: { command: 'action.devices.commands.OnOff', params: { on: true } },
        },
        {
          deviceId: 'device-2',
          command: { command: 'action.devices.commands.OnOff', params: { on: false } },
        },
      ];

      const result = await apiClient.executeCommands(commands);

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/devices:executeCommand',
        expect.objectContaining({
          inputs: expect.arrayContaining([
            expect.objectContaining({
              intent: 'action.devices.EXECUTE',
              payload: expect.objectContaining({
                commands: expect.arrayContaining([
                  expect.objectContaining({
                    devices: [{ id: 'device-1' }],
                    execution: [{ command: 'action.devices.commands.OnOff', params: { on: true } }],
                  }),
                  expect.objectContaining({
                    devices: [{ id: 'device-2' }],
                    execution: [{ command: 'action.devices.commands.OnOff', params: { on: false } }],
                  }),
                ]),
              }),
            }),
          ]),
        })
      );
    });
  });

  describe('retry logic', () => {
    it('should retry on retryable errors', async () => {
      const retryableError = {
        response: { status: 500 },
        config: { url: '/test' },
      };

      mockAxiosInstance.get
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce({ data: { devices: [] } });

      const result = await apiClient.getDevices();

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const nonRetryableError = {
        response: { status: 400 },
        config: { url: '/test' },
      };

      mockAxiosInstance.get.mockRejectedValueOnce(nonRetryableError);

      const result = await apiClient.getDevices();

      expect(result.success).toBe(false);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });
  });
});