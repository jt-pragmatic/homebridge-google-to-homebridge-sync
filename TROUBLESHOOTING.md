# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Homebridge Google Home Sync plugin.

## Common Issues

### Authentication Problems

#### Issue: "Authentication failed" or "Invalid credentials"

**Symptoms:**
- Plugin fails to start with authentication errors
- Log shows "OAuth authentication failed"
- Devices are not discovered

**Solutions:**

1. **Verify Google Cloud Setup:**
   - Ensure Smart Home API is enabled in your Google Cloud project
   - Check that OAuth 2.0 credentials are correctly configured
   - Verify redirect URIs are properly set

2. **Check Configuration:**
   ```json
   {
     "clientId": "your-client-id.apps.googleusercontent.com",
     "clientSecret": "your-client-secret",
     "refreshToken": "your-refresh-token"
   }
   ```

3. **Regenerate Refresh Token:**
   - Use Google OAuth 2.0 Playground
   - Ensure correct scopes are selected
   - Generate new refresh token

#### Issue: "Token expired" or "Invalid token"

**Symptoms:**
- Plugin works initially but stops after some time
- Intermittent authentication failures

**Solutions:**

1. **Check Token Expiry:**
   - Refresh tokens can expire if not used for 6 months
   - Generate a new refresh token

2. **Verify Scopes:**
   - Ensure all required scopes are included:
     - `https://www.googleapis.com/auth/sdm.service`
     - `https://www.googleapis.com/auth/assistant-sdk-prototype`

### Device Discovery Issues

#### Issue: No devices found or some devices missing

**Symptoms:**
- Plugin starts successfully but no devices appear in HomeKit
- Only some devices are imported
- Log shows "Discovered 0 devices"

**Solutions:**

1. **Check Google Home App:**
   - Verify devices are properly set up in Google Home
   - Ensure devices are online and responsive
   - Check device sharing settings

2. **Review Device Filters:**
   ```json
   {
     "deviceFilter": {
       "includeTypes": ["action.devices.types.LIGHT"],
       "excludeRooms": ["Garage"]
     }
   }
   ```

3. **Supported Device Types:**
   - Lights: `action.devices.types.LIGHT`
   - Switches: `action.devices.types.SWITCH`
   - Outlets: `action.devices.types.OUTLET`
   - Thermostats: `action.devices.types.THERMOSTAT`
   - Locks: `action.devices.types.LOCK`
   - Cameras: `action.devices.types.CAMERA`
   - Sensors: `action.devices.types.SENSOR`

#### Issue: Unsupported device types

**Symptoms:**
- Log shows "Unsupported device type: X"
- Some devices don't appear in HomeKit

**Solutions:**

1. **Check Supported Types:**
   - Review the list of supported device types above
   - Some device types may not be supported yet

2. **Request Support:**
   - Create an issue on GitHub with device details
   - Include device type and traits from logs

### State Synchronization Problems

#### Issue: Device states not syncing

**Symptoms:**
- Changes in Google Home don't reflect in HomeKit
- HomeKit commands don't control actual devices
- Devices show "Not Responding" in HomeKit

**Solutions:**

1. **Check Network Connectivity:**
   - Ensure stable internet connection
   - Verify firewall settings allow HTTPS traffic

2. **Adjust Polling Interval:**
   ```json
   {
     "pollingInterval": 15
   }
   ```

3. **Review Rate Limiting:**
   - Google APIs have rate limits
   - Increase polling interval if hitting limits

#### Issue: Delayed state updates

**Symptoms:**
- State changes take too long to sync
- Inconsistent update timing

**Solutions:**

1. **Optimize Polling:**
   - Reduce polling interval for faster updates
   - Balance between responsiveness and API limits

2. **Check Device Response:**
   - Some devices may be slow to respond
   - Network latency can affect sync speed

### Connection and Reliability Issues

#### Issue: Plugin stops working after some time

**Symptoms:**
- Plugin works initially but becomes unresponsive
- Devices show "Not Responding"
- No state updates after a period

**Solutions:**

1. **Check Logs for Errors:**
   - Look for network timeout errors
   - Check for authentication token expiry

2. **Restart Homebridge:**
   - Temporary solution to restore functionality
   - May indicate underlying connection issues

3. **Review Network Stability:**
   - Check for intermittent connectivity issues
   - Ensure DNS resolution is working

#### Issue: High CPU or memory usage

**Symptoms:**
- Homebridge process uses excessive resources
- System becomes slow or unresponsive

**Solutions:**

1. **Adjust Polling Frequency:**
   - Increase polling interval to reduce API calls
   - Monitor resource usage after changes

2. **Reduce Device Count:**
   - Use device filters to limit imported devices
   - Focus on most important devices

### Configuration Issues

#### Issue: Invalid configuration errors

**Symptoms:**
- Plugin fails to start with configuration errors
- Homebridge Config UI X shows validation errors

**Solutions:**

1. **Validate JSON Syntax:**
   - Use JSON validator to check syntax
   - Ensure proper quotes and commas

2. **Check Required Fields:**
   ```json
   {
     "platform": "GoogleHomeSync",
     "name": "Google Home Sync",
     "clientId": "required",
     "clientSecret": "required",
     "refreshToken": "required"
   }
   ```

3. **Review Optional Settings:**
   - Ensure optional fields have correct types
   - Check array and object structures

## Debugging Steps

### Enable Debug Logging

1. **Set Log Level:**
   ```json
   {
     "bridge": {
       "name": "Homebridge",
       "logLevel": "debug"
     }
   }
   ```

2. **Review Debug Output:**
   - Look for detailed API requests/responses
   - Check device discovery process
   - Monitor state synchronization

### Collect Diagnostic Information

When reporting issues, include:

1. **System Information:**
   - Node.js version: `node --version`
   - Homebridge version: `homebridge --version`
   - Plugin version: Check package.json or npm list

2. **Configuration:**
   - Sanitized config (remove credentials)
   - Device filter settings
   - Custom naming configuration

3. **Log Output:**
   - Relevant log entries with timestamps
   - Error messages and stack traces
   - Debug output if available

4. **Device Information:**
   - Device types and manufacturers
   - Google Home app screenshots (if relevant)
   - HomeKit app behavior

### Test Connectivity

1. **API Access Test:**
   ```bash
   curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
        "https://homegraph.googleapis.com/v1/devices"
   ```

2. **Network Test:**
   ```bash
   ping google.com
   nslookup homegraph.googleapis.com
   ```

## Getting Help

### Before Asking for Help

1. **Search Existing Issues:**
   - Check GitHub issues for similar problems
   - Review closed issues for solutions

2. **Try Basic Troubleshooting:**
   - Restart Homebridge
   - Check configuration
   - Review logs for obvious errors

### Where to Get Help

1. **GitHub Issues:**
   - Bug reports and feature requests
   - Include diagnostic information

2. **GitHub Discussions:**
   - General questions and help
   - Community support

3. **Homebridge Discord:**
   - Real-time community help
   - #plugins channel

### Creating Effective Bug Reports

Include the following information:

1. **Clear Description:**
   - What you expected to happen
   - What actually happened
   - Steps to reproduce

2. **Environment Details:**
   - Operating system and version
   - Node.js and Homebridge versions
   - Plugin version

3. **Configuration:**
   - Relevant config sections (remove credentials)
   - Device filter settings

4. **Logs:**
   - Error messages with timestamps
   - Debug output if available
   - Stack traces for crashes

5. **Device Information:**
   - Device types and models
   - Manufacturer information
   - Google Home app status

## Performance Optimization

### Reduce API Calls

1. **Optimize Polling:**
   - Increase polling interval for stable setups
   - Balance between responsiveness and efficiency

2. **Filter Devices:**
   - Import only needed devices
   - Use room or type filters

### Memory Management

1. **Monitor Usage:**
   - Check memory consumption over time
   - Look for memory leaks

2. **Restart Schedule:**
   - Consider periodic Homebridge restarts
   - Use process managers for automatic restarts

This troubleshooting guide should help you resolve most common issues. If you continue to experience problems, please create a detailed issue report on GitHub.