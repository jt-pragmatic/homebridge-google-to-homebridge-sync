# Design Document

## Overview

This Homebridge plugin will integrate with Google Home's ecosystem to import all connected devices into HomeKit. The plugin will use Google's Smart Home API (via Google Assistant SDK or Device Access API) to retrieve device information and states, then create corresponding HomeKit accessories through Homebridge's platform plugin architecture.

The design follows a modular approach with clear separation between Google Home communication, device mapping, and HomeKit integration layers.

## Architecture

The plugin follows Homebridge's platform plugin pattern with these core components:

```
┌─────────────────────────────────────────────────────────────┐
│                    Homebridge Core                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Google Home Platform Plugin                    │
│  ┌─────────────────┬─────────────────┬─────────────────────┐ │
│  │   Auth Manager  │ Device Manager  │  Accessory Factory  │ │
│  └─────────────────┴─────────────────┴─────────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                Google Home API Client                       │
│  ┌─────────────────┬─────────────────┬─────────────────────┐ │
│  │  OAuth Handler  │  Device Client  │   State Manager     │ │
│  └─────────────────┴─────────────────┴─────────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Google Smart Home API                          │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Platform Plugin (Main Entry Point)
- **Purpose**: Homebridge platform plugin entry point
- **Responsibilities**: 
  - Initialize authentication and device discovery
  - Register discovered accessories with Homebridge
  - Handle plugin lifecycle events
- **Key Methods**:
  - `configureAccessory()`: Restore cached accessories
  - `discoverDevices()`: Trigger device discovery process
  - `updateAccessories()`: Handle device additions/removals

### 2. Authentication Manager
- **Purpose**: Handle Google OAuth2 authentication flow
- **Responsibilities**:
  - Manage OAuth2 tokens (access/refresh)
  - Handle token refresh automatically
  - Provide authenticated API clients
- **Key Methods**:
  - `authenticate()`: Initial OAuth flow
  - `refreshToken()`: Automatic token refresh
  - `getAuthenticatedClient()`: Return authenticated HTTP client

### 3. Google Home API Client
- **Purpose**: Interface with Google's Smart Home APIs
- **Responsibilities**:
  - Retrieve device list from Google Home
  - Get device states and capabilities
  - Send control commands to devices
  - Handle API rate limiting and errors
- **Key Methods**:
  - `getDevices()`: Fetch all connected devices
  - `getDeviceState(deviceId)`: Get current device state
  - `executeCommand(deviceId, command)`: Control device
  - `subscribeToUpdates()`: Real-time state updates#
## 4. Device Manager
- **Purpose**: Manage device discovery and lifecycle
- **Responsibilities**:
  - Map Google Home devices to HomeKit accessories
  - Handle device additions/removals
  - Maintain device state synchronization
- **Key Methods**:
  - `discoverDevices()`: Discover and categorize devices
  - `createAccessory(device)`: Create HomeKit accessory
  - `updateDeviceState(deviceId, state)`: Sync state changes
  - `removeDevice(deviceId)`: Handle device removal

### 5. Accessory Factory
- **Purpose**: Create appropriate HomeKit accessories for different device types
- **Responsibilities**:
  - Map Google Home device types to HomeKit services
  - Configure device characteristics and capabilities
  - Handle unsupported device types gracefully
- **Key Methods**:
  - `createLightAccessory(device)`: Create lightbulb accessory
  - `createSwitchAccessory(device)`: Create switch accessory
  - `createCameraAccessory(device)`: Create camera accessory
  - `createSensorAccessory(device)`: Create sensor accessory

### 6. State Synchronization Manager
- **Purpose**: Keep Google Home and HomeKit states synchronized
- **Responsibilities**:
  - Poll for state changes from Google Home
  - Push HomeKit commands to Google Home
  - Handle connection failures and retries
- **Key Methods**:
  - `startPolling()`: Begin state polling
  - `handleStateChange(deviceId, newState)`: Process state updates
  - `sendCommand(deviceId, command)`: Execute HomeKit commands

## Data Models

### Device Model
```typescript
interface GoogleHomeDevice {
  id: string;
  name: string;
  type: DeviceType;
  traits: string[];
  attributes: Record<string, any>;
  state: Record<string, any>;
  roomHint?: string;
  manufacturerInfo?: {
    manufacturer: string;
    model: string;
  };
}

enum DeviceType {
  LIGHT = 'action.devices.types.LIGHT',
  SWITCH = 'action.devices.types.SWITCH',
  OUTLET = 'action.devices.types.OUTLET',
  THERMOSTAT = 'action.devices.types.THERMOSTAT',
  LOCK = 'action.devices.types.LOCK',
  CAMERA = 'action.devices.types.CAMERA',
  SENSOR = 'action.devices.types.SENSOR'
}
```

### Configuration Model
```typescript
interface PluginConfig {
  name: string;
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  pollingInterval?: number; // Default: 30 seconds
  deviceFilter?: {
    includeTypes?: DeviceType[];
    excludeTypes?: DeviceType[];
    includeRooms?: string[];
    excludeRooms?: string[];
  };
  customNames?: Record<string, string>;
}
```

## Error Handling

### Authentication Errors
- **OAuth failures**: Log detailed error, provide setup instructions
- **Token expiry**: Automatic refresh with exponential backoff
- **Invalid credentials**: Clear error message with reconfiguration steps

### API Communication Errors
- **Rate limiting**: Implement exponential backoff with jitter
- **Network timeouts**: Retry with increasing intervals (5s, 15s, 45s)
- **Service unavailable**: Cache last known states, continue serving HomeKit

### Device Errors
- **Unsupported devices**: Log warning, skip gracefully
- **State sync failures**: Mark device as "Not Responding" temporarily
- **Command failures**: Log error, attempt retry once

## Testing Strategy

### Unit Tests
- **Authentication Manager**: Mock OAuth flows, token refresh scenarios
- **Device Manager**: Test device mapping, state synchronization
- **Accessory Factory**: Verify correct HomeKit service creation
- **API Client**: Mock Google Home API responses, error conditions

### Integration Tests
- **End-to-end device discovery**: Test full flow from API to HomeKit
- **State synchronization**: Verify bidirectional state updates
- **Error recovery**: Test reconnection and retry logic
- **Configuration validation**: Test various config scenarios

### Manual Testing
- **Real device testing**: Test with actual Google Home devices
- **HomeKit app testing**: Verify accessories appear and function correctly
- **Network interruption testing**: Test resilience to connectivity issues
- **Performance testing**: Verify polling intervals and resource usage