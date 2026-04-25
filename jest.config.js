const swcJest = [
  '@swc/jest',
  {
    jsc: {
      parser: {
        syntax: 'typescript',
        decorators: true,
      },
      transform: {
        legacyDecorator: true,
        decoratorMetadata: true,
      },
      target: 'es2022',
    },
    module: {
      type: 'commonjs',
    },
  },
];

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/unit/**/*.spec.ts', '**/test/integration/**/*.spec.ts', '**/test/contract/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': swcJest,
  },
  // uuid (v14+) e jose publicam ESM: permitir que o @swc/jest os transforme para CJS no Jest
  transformIgnorePatterns: ['node_modules/(?!(?:uuid|jose)(?:/|$))'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  coverageThreshold: {
    global: {
      branches: 20,
      // @swc/jest aplica cobertura a mais ficheiros; manter alinhado ao valor medido
      functions: 21,
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
