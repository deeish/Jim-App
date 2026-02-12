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
 * Default: http://localhost:3000 (backend). Run the backend with: cd backend && npm run start:dev
 * For physical devices: Use 'http://YOUR_IP:3000' (set in .env)
 */

// Use environment variable if set and non-empty, otherwise default to backend on 3000
// Set EXPO_PUBLIC_API_BASE in .env for physical devices or if your backend runs on a different port
const envBase = process.env.EXPO_PUBLIC_API_BASE?.trim();
const BASE = envBase && envBase.length > 0 ? envBase : 'http://localhost:3000';

// Export the base URL with /api suffix
export const API_BASE_URL = `${BASE}/api`;

// Log the API URL in development for debugging
if (__DEV__) {
  const source = envBase && envBase.length > 0 ? 'EXPO_PUBLIC_API_BASE' : 'default (empty or unset → localhost:3000)';
  console.log('🔌 API Base URL:', API_BASE_URL);
  console.log('🔌 Resolved BASE:', BASE, '←', source);
  console.log('🔌 Start backend if needed: cd backend && npm run start:dev');
}
