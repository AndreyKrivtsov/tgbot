/** @type {import('jest').Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.test.js",
    "**/?(*.)+(spec|test).ts",
    "**/?(*.)+(spec|test).js",
  ],
  // Поддержка ESM + TypeScript через ts-jest
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { useESM: true, tsconfig: "<rootDir>/tsconfig.json" }],
  },
  extensionsToTreatAsEsm: [".ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    // Позволяет импортировать .js пути в TS (ESM) во время тестов
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
  // Настройки для интеграционных тестов
  testTimeout: 15000,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts",
    "!src/test/**",
    "!src/**/__tests__/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  maxWorkers: 1,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true,
}
