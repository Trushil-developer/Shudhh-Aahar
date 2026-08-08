module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react', strict: false } }],
  },
  moduleNameMapper: {
    'react-native': '<rootDir>/node_modules/@types/react-native',
    'aws-amplify(.*)': '<rootDir>/__mocks__/amplify.js',
    '@react-native-async-storage/async-storage': '<rootDir>/__mocks__/asyncStorage.js',
  },
};
