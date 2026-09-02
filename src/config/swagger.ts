import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "무빙(MOVING) API",
      version: "1.0.0",
      description: "이사 소비자와 이사 전문가를 연결하는 매칭 서비스 API 문서",
    },
    // 상대경로 — swagger-ui가 문서 제공 호스트 기준으로 풀어서 씀, 배포 환경에서도 그대로 동작
    servers: [{ url: "/api" }],
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "accessToken" },
      },
      parameters: {
        cursor: {
          in: "query",
          name: "cursor",
          schema: { type: "integer" },
          description: "이전 페이지 마지막 id (무한스크롤 커서)",
        },
        take: {
          in: "query",
          name: "take",
          schema: { type: "integer" },
          description: "페이지당 조회 개수",
        },
        status: {
          in: "query",
          name: "status",
          schema: { type: "string", enum: ["PENDING", "CONFIRMED", "REJECTED", "COMPLETED"] },
          description: "생략 시 전체 조회",
        },
      },
    },
    security: [{ cookieAuth: [] }],
  },
  // dev(tsx)는 .ts를 직접 읽고, 빌드 후(node dist)는 컴파일된 .js를 읽음
  apis: ["src/modules/**/*.route.ts", "dist/src/modules/**/*.route.js"],
});
