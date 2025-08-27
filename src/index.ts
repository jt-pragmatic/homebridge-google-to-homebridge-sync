import { API } from 'homebridge';
import { GoogleHomePlatform } from './platform';
import { PLATFORM_NAME, PLUGIN_NAME } from './constants';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, GoogleHomePlatform);
};