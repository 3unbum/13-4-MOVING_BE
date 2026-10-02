import cors from "cors";
import express from "express";
import request from "supertest";

/**
 * `CLIENT_URL` 을 쉼표로 여러 개 받는 동작을 검증합니다.
 *
 * `app.ts` 를 통째로 import 하면 Prisma·Swagger 까지 로드돼 단위 테스트가 무거워지므로,
 * 같은 파싱 규칙과 `cors()` 설정만 떼어 와서 실제 HTTP 요청으로 확인합니다.
 * 파싱 규칙이 바뀌면 이 테스트도 같이 고쳐야 합니다.
 */
function makeApp(clientUrl: string) {
  const allowedOrigins = clientUrl
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const app = express();
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.get("/api/health", (_req, res) => {
    res.json({ data: { status: "ok" } });
  });
  return app;
}

const PROD = "https://www.letsmoving.site";
const VERCEL = "https://13-4-moving-fe.vercel.app";

describe("CORS allowed origins", () => {
  it("쉼표로 넣은 origin 을 모두 허용한다", async () => {
    const app = makeApp(`${PROD},${VERCEL}`);

    for (const origin of [PROD, VERCEL]) {
      const res = await request(app).get("/api/health").set("Origin", origin);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
      // 쿠키 인증을 쓰므로 credentials 도 함께 내려가야 한다
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    }
  });

  it("목록에 없는 origin 에는 허용 헤더를 내려주지 않는다", async () => {
    const app = makeApp(PROD);

    const res = await request(app).get("/api/health").set("Origin", "https://evil.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("공백이 섞여 있어도 잘라낸다", async () => {
    const app = makeApp(`  ${PROD} , ${VERCEL}  `);

    const res = await request(app).get("/api/health").set("Origin", VERCEL);
    expect(res.headers["access-control-allow-origin"]).toBe(VERCEL);
  });

  it("origin 이 하나뿐이어도 기존처럼 동작한다", async () => {
    const app = makeApp(PROD);

    const res = await request(app).get("/api/health").set("Origin", PROD);
    expect(res.headers["access-control-allow-origin"]).toBe(PROD);
  });

  it("preflight(OPTIONS) 에도 허용 헤더를 내려준다", async () => {
    const app = makeApp(`${PROD},${VERCEL}`);

    const res = await request(app)
      .options("/api/health")
      .set("Origin", PROD)
      .set("Access-Control-Request-Method", "GET");
    expect(res.headers["access-control-allow-origin"]).toBe(PROD);
  });
});
