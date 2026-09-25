import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "../errors/errorCodes";
import { loginRateLimiter } from "./rateLimit";

function makeReq(email: string): Request {
  return { body: { email } } as unknown as Request;
}

function makeRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.headersSent = false;
  return res;
}

describe("loginRateLimiter", () => {
  test("같은 이메일로 15분에 5회까지는 next를 호출해 통과시킨다", async () => {
    // Setup
    const req = makeReq("limit-pass@test.com");
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    // Exercise
    for (let i = 0; i < 5; i++) {
      await loginRateLimiter(req, res, next);
    }

    // Assertion
    expect(next).toHaveBeenCalledTimes(5);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("같은 이메일로 6번째 요청부터는 429 TOO_MANY_REQUESTS를 응답한다", async () => {
    // Setup
    const req = makeReq("limit-exceed@test.com");
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    // Exercise
    for (let i = 0; i < 5; i++) {
      await loginRateLimiter(req, res, next);
    }
    await loginRateLimiter(req, res, next);

    // Assertion
    expect(next).toHaveBeenCalledTimes(5);
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

  test("이메일이 다르면 서로 다른 카운트로 취급한다", async () => {
    // Setup
    const resA = makeRes();
    const resB = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    // Exercise: A는 한도(5회)를 모두 소진하고, B는 처음 요청
    for (let i = 0; i < 5; i++) {
      await loginRateLimiter(makeReq("user-a@test.com"), resA, next);
    }
    await loginRateLimiter(makeReq("user-b@test.com"), resB, next);

    // Assertion: B는 A의 카운트에 영향받지 않고 통과한다
    expect(resB.status).not.toHaveBeenCalled();
  });
});
