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
      schemas: {
        Address: {
          type: "object",
          required: ["postalCode", "region", "address", "detailAddress"],
          properties: {
            postalCode: { type: "string", example: "06234" },
            region: {
              type: "string",
              enum: [
                "SEOUL",
                "GYEONGGI",
                "INCHEON",
                "GANGWON",
                "CHUNGBUK",
                "CHUNGNAM",
                "SEJONG",
                "DAEJEON",
                "JEONBUK",
                "JEONNAM",
                "GWANGJU",
                "GYEONGBUK",
                "GYEONGNAM",
                "DAEGU",
                "ULSAN",
                "BUSAN",
                "JEJU",
              ],
            },
            address: { type: "string", example: "서울 강남구 테헤란로 123" },
            detailAddress: { type: "string", example: "101동 1001호" },
          },
        },
      },
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "accessToken" },
        refreshTokenAuth: { type: "apiKey", in: "cookie", name: "refreshToken" },
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
