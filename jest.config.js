module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/unit/**/*.spec.ts', '**/test/integration/**/*.spec.ts', '**/test/contract/**/*.spec.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  // Ratchet baseline — raise toward target as more tests are added:
  // target: branches 50 / functions 60 / lines 60 / statements 60
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 23,
      lines: 26,
      statements: 25,
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/worker/main.ts',
  ],
};
