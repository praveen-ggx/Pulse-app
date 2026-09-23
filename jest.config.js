/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'platform',
      testMatch: ['<rootDir>/lib/platform/**/__tests__/**/*.test.ts'],
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': ['ts-jest/legacy', { isolatedModules: true }],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
    },
    {
      displayName: 'pulse-v2',
      testMatch: ['<rootDir>/packages/pulse-v2/**/*.test.ts'],
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': ['ts-jest/legacy', { isolatedModules: true }],
      },
    },
    {
      displayName: 'oms',
      testMatch: ['<rootDir>/oms/src/**/__tests__/**/*.test.ts'],
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': ['ts-jest/legacy', { isolatedModules: true }],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/oms/src/$1',
      },
    },
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: [
        '<rootDir>/**/__tests__/**/*.test.ts',
        '<rootDir>/**/__tests__/**/*.test.tsx',
        '<rootDir>/**/*.test.ts',
        '<rootDir>/**/*.test.tsx',
      ],
      // Vitest packages (packages/, analytics/, oms/, tools/) own their runners —
      // do not pull them into the app Jest project.
      testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/lib/platform/',
        '<rootDir>/packages/',
        '<rootDir>/analytics/',
        '<rootDir>/oms/',
        '<rootDir>/tools/',
        '<rootDir>/_reference/',
        '<rootDir>/.worktrees/',
      ],
      setupFiles: ['./__mocks__/expo.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '@expo/vector-icons$': '<rootDir>/__mocks__/@expo/vector-icons.ts',
        '@react-native-async-storage/async-storage':
          '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
        'expo-image-manipulator': '<rootDir>/__mocks__/expo-image-manipulator.js',
        'expo-image-picker': '<rootDir>/__mocks__/expo-image-picker.js',
        // @sentry/react-native ships untranspiled ESM that Jest cannot parse, so
        // any test transitively importing lib/crashReporter.ts dies with
        // "Unexpected token 'export'". Crash reporting is a no-op in tests, so a
        // stub is cheaper than transforming the package. Jest's node_modules
        // auto-mock convention would find __mocks__/@sentry/react-native.js on
        // its own; mapping it explicitly keeps the dependency visible here.
        '^@sentry/react-native$': '<rootDir>/__mocks__/@sentry/react-native.js',
      },
      // moti / react-native-reanimated / lottie ship untranspiled ESM, so they
      // must be transformed rather than passed through — otherwise any test
      // rendering a screen that imports them dies on "Unexpected token 'export'".
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native|expo|@expo|react-native-safe-area-context|moti|react-native-reanimated|lottie-react-native|@motify))',
      ],
    },
  ],
};
