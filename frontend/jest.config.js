/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/src/setupJest.ts'],
  collectCoverageFrom: ['src/lib/**/*.ts', '!src/lib/**/*.test.ts'],
  coverageDirectory: 'coverage',
  verbose: true,
};
