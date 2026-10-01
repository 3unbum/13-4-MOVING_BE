import { ERROR_CODES } from "../../common/errors/errorCodes";
import { reviewService } from "./review.service";
import { reviewRepository } from "./review.repository";

jest.mock("./review.repository", () => ({
  reviewRepository: {
    findWritableByCustomerId: jest.fn(),
    findWrittenByCustomerId: jest.fn(),
    findReceivedByMoverId: jest.fn(),
    findById: jest.fn(),
    confirmOwned: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(reviewRepository);

describe("reviewService.listWritable", () => {
  beforeEach(() => jest.clearAllMocks());

  it("take+1로 조회한다", async () => {
    mockedRepository.findWritableByCustomerId.mockResolvedValue([] as never);

    await reviewService.listWritable(1, {});

    expect(mockedRepository.findWritableByCustomerId).toHaveBeenCalledWith(1, undefined, 11);
  });
});

describe("reviewService.confirm", () => {
  beforeEach(() => jest.clearAllMocks());

  it("PENDING 리뷰를 작성하고 평점 집계를 반환한다", async () => {
    mockedRepository.findById.mockResolvedValue({
      id: 7,
      customerId: 1,
      status: "PENDING",
      estimate: { moverId: 10, estimateStatus: "COMPLETED" },
    } as never);
    mockedRepository.confirmOwned.mockResolvedValue({ avgRating: 4.5, reviewCount: 3 });

    const result = await reviewService.confirm(1, 7, {
      rating: 5,
      comment: "정말 친절하고 안전하게 이사했습니다",
    });

    expect(mockedRepository.confirmOwned).toHaveBeenCalledWith(
      7,
      1,
      10,
      5,
      "정말 친절하고 안전하게 이사했습니다"
    );
    expect(result).toEqual({
      id: 7,
      rating: 5,
      comment: "정말 친절하고 안전하게 이사했습니다",
      avgRating: 4.5,
      reviewCount: 3,
    });
  });

  it("본인 리뷰가 아니면 403을 던진다", async () => {
    mockedRepository.findById.mockResolvedValue({
      id: 7,
      customerId: 2,
      status: "PENDING",
      estimate: { moverId: 10, estimateStatus: "COMPLETED" },
    } as never);

    await expect(
      reviewService.confirm(1, 7, { rating: 5, comment: "정말 친절하고 안전하게 이사했습니다" })
    ).rejects.toMatchObject({ statusCode: 403, code: ERROR_CODES.FORBIDDEN });
    expect(mockedRepository.confirmOwned).not.toHaveBeenCalled();
  });

  it("이미 CONFIRMED면 409를 던진다", async () => {
    mockedRepository.findById.mockResolvedValue({
      id: 7,
      customerId: 1,
      status: "CONFIRMED",
      estimate: { moverId: 10, estimateStatus: "COMPLETED" },
    } as never);

    await expect(
      reviewService.confirm(1, 7, { rating: 5, comment: "정말 친절하고 안전하게 이사했습니다" })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.REVIEW_ALREADY_CONFIRMED,
    });
  });

  it("이사가 완료되지 않았으면 400을 던진다", async () => {
    mockedRepository.findById.mockResolvedValue({
      id: 7,
      customerId: 1,
      status: "PENDING",
      estimate: { moverId: 10, estimateStatus: "ASSIGNED" },
    } as never);

    await expect(
      reviewService.confirm(1, 7, { rating: 5, comment: "정말 친절하고 안전하게 이사했습니다" })
    ).rejects.toMatchObject({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR });
    expect(mockedRepository.confirmOwned).not.toHaveBeenCalled();
  });
});
