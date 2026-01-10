import { Platform } from 'react-native';

/**
 * API Configuration
 * 
 * Uses environment variable EXPO_PUBLIC_API_BASE if set, otherwise defaults to localhost
 * 
 * To set for physical devices, create a .env file in the frontend directory:
 *   EXPO_PUBLIC_API_BASE=http://192.168.86.39:3000
 * 
 * To find your IP:
 * - Windows: Run `ipconfig` in terminal, look for IPv4 Address
 * - Mac/Linux: Run `ifconfig` or `ip addr`
 * 
 * For web/simulators/emulators: Use 'http://localhost:3000' (default)
 * For physical devices: Use 'http://YOUR_IP:3000' (set in .env)
 */

// Use environment variable if set, otherwise default to localhost
// Web always uses localhost, mobile uses env var or localhost
const BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000';

// Export the base URL with /api suffix
export const API_BASE_URL = `${BASE}/api`;

// Log the API URL in development for debugging
if (__DEV__) {
  console.log('🔌 API Base URL:', API_BASE_URL);
  if (process.env.EXPO_PUBLIC_API_BASE) {
    console.log('📝 Using EXPO_PUBLIC_API_BASE from environment');
  } else {
    console.log('📝 Using default localhost (set EXPO_PUBLIC_API_BASE in .env for physical devices)');
  }
}
