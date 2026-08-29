/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // 요구사항: 테스트 커버리지 측정 적용
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.d.ts",
    "!src/app.ts",
    "!src/server.ts",
  ],
};
