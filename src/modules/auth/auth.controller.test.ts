import type { Request, Response } from "express";
import { authController } from "./auth.controller";
import { authService } from "./auth.service";

jest.mock("./auth.service", () => ({
  authService: { sendPasswordResetCode: jest.fn() },
}));
jest.mock("../profile/profile.service", () => ({ profileService: {} }));

const mockedSendPasswordResetCode = jest.mocked(authService.sendPasswordResetCode);

function makeRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe("authController.sendPasswordResetCode", () => {
  test("조회·발송이 끝나기 전에 204로 먼저 응답한다 — 응답 시간으로 가입 여부가 드러나지 않도록", async () => {
    // Setup: 가입된 계정의 Gmail 발송처럼 오래 걸리는 서비스 호출
    let finishSending!: (sent: boolean) => void;
    mockedSendPasswordResetCode.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSending = resolve;
      })
    );
    const req = { body: { role: "CUSTOMER", email: "test@moving.com" } } as Request;
    const res = makeRes();

    // Exercise
    const handling = authController.sendPasswordResetCode(req, res, jest.fn());

    // Assertion: 발송이 끝나지 않았는데도 이미 204가 나갔다
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
    expect(mockedSendPasswordResetCode).toHaveBeenCalledWith(req.body);

    // Teardown
    finishSending(true);
    await handling;
  });
});
