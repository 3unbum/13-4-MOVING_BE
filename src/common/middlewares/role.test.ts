import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "../errors/errorCodes";
import { requireRole } from "./role";

function makeReq(user?: Express.User) {
  return { user } as Request;
}

describe("requireRole", () => {
  test("로그인하지 않았으면(req.user 없음) 401 UNAUTHORIZED로 next를 호출한다", () => {
    // Setup
    const req = makeReq(undefined);
    const next = jest.fn() as unknown as NextFunction;
    const middleware = requireRole("CUSTOMER");

    // Exercise
    middleware(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: ERROR_CODES.UNAUTHORIZED })
    );
  });

  test("로그인한 유저의 역할이 허용 목록에 없으면 403 FORBIDDEN으로 next를 호출한다", () => {
    // Setup
    const req = makeReq({ id: 1, role: "CUSTOMER" });
    const next = jest.fn() as unknown as NextFunction;
    const middleware = requireRole("MOVER");

    // Exercise
    middleware(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: ERROR_CODES.FORBIDDEN })
    );
  });

  test("로그인한 유저의 역할이 허용 목록에 있으면 통과시킨다", () => {
    // Setup
    const req = makeReq({ id: 1, role: "MOVER" });
    const next = jest.fn() as unknown as NextFunction;
    const middleware = requireRole("CUSTOMER", "MOVER");

    // Exercise
    middleware(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith();
  });
});
