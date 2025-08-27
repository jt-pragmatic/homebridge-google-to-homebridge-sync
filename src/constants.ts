/**
 * Platform and plugin constants
 */
export const PLATFORM_NAME = 'GoogleHomeToHomebridgeSync';
export const PLUGIN_NAME = 'homebridge-google-home-sync';

/**
 * Google API constants
 */
export const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_SMART_HOME_API_URL = 'https://homegraph.googleapis.com/v1';

/**
 * Default configuration values
 */
export const DEFAULT_POLLING_INTERVAL = 30; // seconds
export const DEFAULT_RETRY_DELAY = 5000; // milliseconds
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * OAuth scopes required for Google Smart Home API
 */
export const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/sdm.service',
  'https://www.googleapis.com/auth/assistant-sdk-prototype',
];