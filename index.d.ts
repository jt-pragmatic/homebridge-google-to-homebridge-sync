import { API } from 'homebridge';

/**
 * Homebridge Google Home Sync Plugin
 * 
 * This plugin automatically imports and synchronizes all devices connected to your 
 * Google Home ecosystem into HomeKit, supporting devices from any manufacturer.
 */
declare function plugin(api: API): void;

export = plugin;