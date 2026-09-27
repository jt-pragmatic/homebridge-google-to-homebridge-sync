import { AuthManager } from '../AuthManager';
import { PluginConfig } from '../../types';
import { Logger } from 'homebridge';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

describe('AuthManager', () => {
  let authManager: AuthManager;
  let config: PluginConfig;

  beforeEach(() => {
    config = {
      name: 'Test',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      refreshToken: 'test-refresh-token',
    };
    authManager = new AuthManager(config, mockLogger);
    jest.clearAllMocks();
  });

  describe('refreshToken', () => {
    it('should successfully refresh token', async () => {
      const mockResponse = {
        data: {
          access_token: 'new-access-token',
          expires_in: 3600,
          refresh_token: 'new-refresh-token',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await authManager.refreshToken();

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          refresh_token: 'test-refresh-token',
          grant_type: 'refresh_token',
        }),
        expect.any(Object)
      );
    });

    it('should throw error when refresh token is not available', async () => {
      const configWithoutRefreshToken = {
        name: 'Test',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      };
      const authManagerWithoutToken = new AuthManager(configWithoutRefreshToken, mockLogger);

      await expect(authManagerWithoutToken.refreshToken()).rejects.toThrow('No refresh token available');
    });

    it('should handle API errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('API Error'));

      await expect(authManager.refreshToken()).rejects.toThrow('Token refresh failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getValidAccessToken', () => {
    it('should return valid access token', async () => {
      const mockResponse = {
        data: {
          access_token: 'valid-access-token',
          expires_in: 3600,
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const token = await authManager.getValidAccessToken();

      expect(token).toBe('valid-access-token');
    });

    it('should refresh token when expired', async () => {
      // First call to refresh token
      const mockResponse = {
        data: {
          access_token: 'refreshed-access-token',
          expires_in: 3600,
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const token = await authManager.getValidAccessToken();

      expect(token).toBe('refreshed-access-token');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no tokens', () => {
      const configWithoutRefreshToken = {
        name: 'Test',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      };
      const authManagerWithoutToken = new AuthManager(configWithoutRefreshToken, mockLogger);

      expect(authManagerWithoutToken.isAuthenticated()).toBe(false);
    });

    it('should return true when tokens are valid', async () => {
      const mockResponse = {
        data: {
          access_token: 'valid-access-token',
          expires_in: 3600,
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);
      await authManager.refreshToken();

      expect(authManager.isAuthenticated()).toBe(true);
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should successfully exchange code for tokens', async () => {
      const mockResponse = {
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await authManager.exchangeCodeForTokens('auth-code', 'http://localhost:3000/callback');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          code: 'auth-code',
          grant_type: 'authorization_code',
          redirect_uri: 'http://localhost:3000/callback',
        }),
        expect.any(Object)
      );
    });
  });

  describe('getOAuthUrl', () => {
    it('should generate correct OAuth URL', () => {
      const url = authManager.getOAuthUrl('http://localhost:3000/callback');

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback');
      expect(url).toContain('response_type=code');
      expect(url).toContain(encodeURIComponent('https://www.googleapis.com/auth/sdm.service'));
      expect(url).toContain(encodeURIComponent('https://www.googleapis.com/auth/assistant-sdk-prototype'));
      expect(url).toContain(encodeURIComponent('https://www.googleapis.com/auth/homegraph'));
      expect(url).toContain('access_type=offline');
    });
  });

  describe('clearTokens', () => {
    it('should clear stored tokens', () => {
      authManager.clearTokens();
      expect(authManager.isAuthenticated()).toBe(false);
    });
  });
});
