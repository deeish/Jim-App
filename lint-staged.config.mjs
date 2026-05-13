/**
 * Runs repo linters only when matching paths are staged. Uses --prefix so it works from the monorepo root on Windows/Git Bash/macOS/Linux.
 */

/** @type {import('lint-staged').Configuration} */
export default {
  'backend/**/*.ts': () => 'npm run lint --prefix backend',
  'frontend/**/*.{ts,tsx}': () => 'npm run lint --prefix frontend',
};
