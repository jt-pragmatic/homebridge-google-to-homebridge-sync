import { AuthTokens } from '../types';

export interface IAuthManager {
  /**
   * Initialize authentication with Google OAuth2
   */
  authenticate(): Promise<AuthTokens>;

  /**
   * Refresh the access token using the refresh token
   */
  refreshToken(): Promise<AuthTokens>;

  /**
   * Get current valid access token, refreshing if necessary
   */
  getValidAccessToken(): Promise<string>;

  /**
   * Check if current tokens are valid
   */
  isAuthenticated(): boolean;

  /**
   * Clear stored authentication tokens
   */
  clearTokens(): void;
}