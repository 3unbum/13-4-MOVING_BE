import { EventEmitter } from "node:events";
import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "../errors/errorCodes";
import { loginRateLimiter } from "./rateLimit";

type Role = "CUSTOMER" | "MOVER";

function makeReq(email: string, role: Role = "CUSTOMER"): Request {
  return { body: { role, email } } as unknown as Request;
}

// skipSuccessfulRequests가 res.once("finish")를 구독하므로 EventEmitter 기반으로 만듭니다
function makeRes() {
  const res = new EventEmitter() as unknown as Response;
  res.statusCode = 200;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.headersSent = false;
  return res;
}

/**
 * 로그인 요청 1회를 흉내냅니다.
 * 미들웨어를 통과하면(next 호출) 컨트롤러가 statusCode로 응답했다고 보고 finish를 발생시킵니다.
 * 카운트 차감은 finish 이후 비동기로 일어나므로 마이크로태스크를 한 번 비워줍니다.
 */
async function attemptLogin(req: Request, statusCode: number) {
  const res = makeRes();
  const next = jest.fn() as unknown as NextFunction;

  await loginRateLimiter(req, res, next);

  const passed = (next as jest.Mock).mock.calls.length > 0;
  if (passed) res.statusCode = statusCode;
  res.emit("finish");
  await new Promise((resolve) => setImmediate(resolve));

  return { res, passed };
}

describe("loginRateLimiter", () => {
  test("같은 계정으로 15분에 5회 실패까지는 next를 호출해 통과시킨다", async () => {
    // Setup
    const req = makeReq("limit-pass@test.com");

    // Exercise
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await attemptLogin(req, 401));
    }

    // Assertion
    expect(results.every((r) => r.passed)).toBe(true);
    results.forEach(({ res }) => expect(res.status).not.toHaveBeenCalled());
  });

  test("같은 계정으로 5회 실패 후 6번째 요청부터는 429 TOO_MANY_REQUESTS를 응답한다", async () => {
    // Setup
    const req = makeReq("limit-exceed@test.com");

    // Exercise
    for (let i = 0; i < 5; i++) {
      await attemptLogin(req, 401);
    }
    const { res, passed } = await attemptLogin(req, 401);

    // Assertion
    expect(passed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ERROR_CODES.TOO_MANY_REQUESTS,
        message: expect.any(String),
        retryAfterSeconds: expect.any(Number),
      },
    });

    const [[body]] = (res.json as jest.Mock).mock.calls;
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.error.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  test("로그인에 성공한 요청은 카운트에 포함하지 않는다", async () => {
    // Setup
    const req = makeReq("limit-success@test.com");

    // Exercise: 한도(5회)를 넘는 6번의 성공 후, 실패 1회
    for (let i = 0; i < 6; i++) {
      await attemptLogin(req, 200);
    }
    const { res, passed } = await attemptLogin(req, 401);

    // Assertion: 성공은 차감되어 7번째 요청도 통과한다
    expect(passed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("이메일이 다르면 서로 다른 카운트로 취급한다", async () => {
    // Exercise: A는 한도(5회)를 모두 소진하고, B는 처음 요청
    for (let i = 0; i < 5; i++) {
      await attemptLogin(makeReq("user-a@test.com"), 401);
    }
    const { res, passed } = await attemptLogin(makeReq("user-b@test.com"), 401);

    // Assertion: B는 A의 카운트에 영향받지 않고 통과한다
    expect(passed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("이메일이 같아도 role이 다르면 서로 다른 카운트로 취급한다", async () => {
    // Exercise: CUSTOMER 계정이 한도(5회)를 모두 소진하고, 같은 이메일의 MOVER 계정이 처음 요청
    for (let i = 0; i < 5; i++) {
      await attemptLogin(makeReq("same-email@test.com", "CUSTOMER"), 401);
    }
    const { res, passed } = await attemptLogin(makeReq("same-email@test.com", "MOVER"), 401);

    // Assertion: MOVER는 CUSTOMER의 카운트에 영향받지 않고 통과한다
    expect(passed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});
