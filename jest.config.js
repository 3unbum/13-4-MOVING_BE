/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // ts-jest가 `generated/prisma/client.ts` import를 .js로 바꿔 해석하는데
    // prisma가 내보내는 파일은 .ts뿐입니다. repository를 직접 테스트할 때
    // (prisma를 mock해도) Prisma 네임스페이스는 실제 require가 일어나 필요합니다.
    "generated/prisma/(.*)\\.js$": "<rootDir>/generated/prisma/$1.ts",
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
