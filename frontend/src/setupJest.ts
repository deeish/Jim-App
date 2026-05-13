/** Jest runs in Node — mirror RN/Expo `__DEV__` so modules like `src/config/api.ts` load in tests. */
(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;
