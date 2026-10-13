import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "../errors/errorCodes";

const mockEnv = { TURNSTILE_SECRET_KEY: "secret" };
jest.mock("../../config/env", () => ({ env: mockEnv }));

import { verifyTurnstile } from "./turnstile";

const run = async (body: unknown) => {
  const next = jest.fn() as unknown as NextFunction;
  await verifyTurnstile({ body } as Request, {} as Response, next);
  return next as unknown as jest.Mock;
};

const mockSiteverify = (success: boolean) =>
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue({ json: async () => ({ success }) } as unknown as globalThis.Response);

describe("verifyTurnstile", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockEnv.TURNSTILE_SECRET_KEY = "secret";
  });

  test("시크릿 키가 없으면 검증 없이 통과한다", async () => {
    mockEnv.TURNSTILE_SECRET_KEY = "";
    const fetchSpy = jest.spyOn(global, "fetch");

    const next = await run({});

    expect(next).toHaveBeenCalledWith();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("토큰이 없으면 Cloudflare를 부르지 않고 400 BOT_CHECK_FAILED로 막는다", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");

    const next = await run({});

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: ERROR_CODES.BOT_CHECK_FAILED })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("Cloudflare가 success를 주면 통과한다", async () => {
    mockSiteverify(true);

    expect(await run({ turnstileToken: "t" })).toHaveBeenCalledWith();
  });

  test("Cloudflare가 실패를 주면 막는다", async () => {
    mockSiteverify(false);

    expect(await run({ turnstileToken: "t" })).toHaveBeenCalledWith(
      expect.objectContaining({ code: ERROR_CODES.BOT_CHECK_FAILED })
    );
  });

  test("Cloudflare 호출이 실패해도 통과시키지 않는다(fail-closed)", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("timeout"));

    expect(await run({ turnstileToken: "t" })).toHaveBeenCalledWith(
      expect.objectContaining({ code: ERROR_CODES.BOT_CHECK_FAILED })
    );
  });
});
