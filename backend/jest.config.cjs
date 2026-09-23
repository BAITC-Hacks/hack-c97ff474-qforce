const base = {
  rootDir: '.',
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: true }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
};

module.exports = {
  testTimeout: 60000,
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/test/unit/**/*.spec.ts', '<rootDir>/test/evaluations/**/*.spec.ts'] },
    { ...base, displayName: 'integration', testMatch: ['<rootDir>/test/integration/**/*.spec.ts'] },
    { ...base, displayName: 'e2e', testMatch: ['<rootDir>/test/e2e/**/*.spec.ts'] },
    { ...base, displayName: 'architecture', testMatch: ['<rootDir>/test/architecture/**/*.spec.ts'] },
  ],
};
