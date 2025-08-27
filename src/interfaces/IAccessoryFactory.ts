import { GoogleHomeDevice } from '../types';
import { PlatformAccessory, Service } from 'homebridge';

export interface IAccessoryFactory {
  /**
   * Create a light accessory with appropriate characteristics
   */
  createLightAccessory(device: GoogleHomeDevice, accessory: PlatformAccessory): Service[];

  /**
   * Create a switch accessory
   */
  createSwitchAccessory(device: GoogleHomeDevice, accessory: PlatformAccessory): Service[];

  /**
   * Create an outlet accessory
   */
  createOutletAccessory(device: GoogleHomeDevice, accessory: PlatformAccessory): Service[];

  /**
   * Create a thermostat accessory
   */
  createThermostatAccessory(device: GoogleHomeDevice, accessory: PlatformAccessory): Service[];

  /**
   * Create a lock accessory
   */
  createLockAccessory(device: GoogleHomeDevice, accessory: PlatformAccessory): Service[];

  /**
   * Create a camera accessory
   */
  createCameraAccessory(device: GoogleHomeDevice, accessory: PlatformAccessory): Service[];

  /**
   * Create sensor accessories (motion, contact, temperature, etc.)
   */
  createSensorAccessory(device: GoogleHomeDevice, accessory: PlatformAccessory): Service[];

  /**
   * Create services for a device based on its type and traits
   */
  createServicesForDevice(device: GoogleHomeDevice, accessory: PlatformAccessory): Service[];
}