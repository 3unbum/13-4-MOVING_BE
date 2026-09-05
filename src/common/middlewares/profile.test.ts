import type { Request, Response } from "express";
import { ERROR_CODES } from "../errors/errorCodes";
import { requireProfile } from "./profile";
import { profileRepository } from "../../modules/profile/profile.repository";

jest.mock("../../modules/profile/profile.repository", () => ({
  profileRepository: {
    exists: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(profileRepository);

function makeReq(user?: { id: number; role: "CUSTOMER" | "MOVER" }) {
  return { user } as unknown as Request;
}

describe("requireProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("req.user가 없으면 401을 던진다", async () => {
    const req = makeReq(undefined);
    const next = jest.fn();

    await requireProfile(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(mockedRepository.exists).not.toHaveBeenCalled();
  });

  it("프로필이 있으면 통과시킨다", async () => {
    mockedRepository.exists.mockResolvedValue(true);
    const req = makeReq({ id: 1, role: "CUSTOMER" });
    const next = jest.fn();

    await requireProfile(req, {} as Response, next);

    expect(mockedRepository.exists).toHaveBeenCalledWith(1, "CUSTOMER");
    expect(next).toHaveBeenCalledWith();
  });

  it("프로필이 없으면 400 PROFILE_REQUIRED를 던진다", async () => {
    mockedRepository.exists.mockResolvedValue(false);
    const req = makeReq({ id: 1, role: "MOVER" });
    const next = jest.fn();

    await requireProfile(req, {} as Response, next);

    expect(mockedRepository.exists).toHaveBeenCalledWith(1, "MOVER");
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: ERROR_CODES.PROFILE_REQUIRED })
    );
  });

  it("repository가 에러를 던지면 next로 넘긴다", async () => {
    const error = new Error("DB 에러");
    mockedRepository.exists.mockRejectedValue(error);
    const req = makeReq({ id: 1, role: "CUSTOMER" });
    const next = jest.fn();

    await requireProfile(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
