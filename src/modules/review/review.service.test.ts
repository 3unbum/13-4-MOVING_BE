import { ERROR_CODES } from "../../common/errors/errorCodes";
import { reviewService } from "./review.service";
import { reviewRepository } from "./review.repository";
import { uploadReviewImage } from "./review.storage";

jest.mock("./review.repository", () => ({
  reviewRepository: {
    findWritableByCustomerId: jest.fn(),
    findWrittenByCustomerId: jest.fn(),
    findReceivedByMoverId: jest.fn(),
    findById: jest.fn(),
    confirmOwned: jest.fn(),
    updateOwned: jest.fn(),
    countImages: jest.fn(),
    createImage: jest.fn(),
    deleteImage: jest.fn(),
  },
}));

jest.mock("./review.storage", () => ({
  uploadReviewImage: jest.fn(),
}));

const mockedRepository = jest.mocked(reviewRepository);
const mockedUpload = jest.mocked(uploadReviewImage);

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const pendingReview = {
  id: 7,
  customerId: 1,
  status: "PENDING",
  estimate: { moverId: 10, estimateStatus: "COMPLETED" },
} as const;

function detailRow(images: { imageUrl: string }[]) {
  return {
    id: 3,
    rating: 5,
    comment: "정말 친절하고 안전하게 이사했습니다",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    images,
    estimate: {
      moverId: 10,
      mover: { moverProfile: { nickName: "김기사", image: null } },
      quotationRequest: {
        movingDate: new Date("2026-03-01T00:00:00.000Z"),
        fromAddress: "서울",
        toAddress: "부산",
        category: "SMALL",
      },
    },
  };
}

describe("reviewService.listWritable", () => {
  beforeEach(() => jest.clearAllMocks());

  it("take+1로 조회한다", async () => {
    mockedRepository.findWritableByCustomerId.mockResolvedValue([] as never);

    await reviewService.listWritable(1, {});

    expect(mockedRepository.findWritableByCustomerId).toHaveBeenCalledWith(1, undefined, 11);
  });

  it("작성 중인 사진 URL을 정렬된 그대로 담는다", async () => {
    mockedRepository.findWritableByCustomerId.mockResolvedValue([
      detailRow([
        { imageUrl: "https://cdn.example/1.jpg" },
        { imageUrl: "https://cdn.example/2.jpg" },
      ]),
    ] as never);

    const result = await reviewService.listWritable(1, { take: 10 });

    expect(result.items[0]?.imageUrls).toEqual([
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
    ]);
  });
});

describe("reviewService.listWritten", () => {
  beforeEach(() => jest.clearAllMocks());

  it("작성한 사진 URL을 담는다", async () => {
    mockedRepository.findWrittenByCustomerId.mockResolvedValue([
      detailRow([{ imageUrl: "https://cdn.example/done.jpg" }]),
    ] as never);

    const result = await reviewService.listWritten(1, { take: 10 });

    expect(result.items[0]?.imageUrls).toEqual(["https://cdn.example/done.jpg"]);
  });
});

describe("reviewService.listReceived", () => {
  beforeEach(() => jest.clearAllMocks());

  it("받은 리뷰의 사진 URL을 담는다", async () => {
    mockedRepository.findReceivedByMoverId.mockResolvedValue([
      {
        id: 4,
        rating: 4,
        comment: "좋아요",
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        images: [{ imageUrl: "https://cdn.example/received.jpg" }],
      },
    ] as never);

    const result = await reviewService.listReceived(10, { take: 10 });

    expect(result.items[0]?.imageUrls).toEqual(["https://cdn.example/received.jpg"]);
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

  it("이미 CONFIRMED면 건수를 올리지 않고 내용만 고친다", async () => {
    mockedRepository.findById.mockResolvedValue({
      id: 7,
      customerId: 1,
      status: "CONFIRMED",
      estimate: { moverId: 10, estimateStatus: "COMPLETED" },
    } as never);
    mockedRepository.updateOwned.mockResolvedValue({ avgRating: 4.5, reviewCount: 3 });

    const result = await reviewService.confirm(1, 7, {
      rating: 4,
      comment: "정말 친절하고 안전하게 이사했습니다",
    });

    expect(mockedRepository.updateOwned).toHaveBeenCalledWith(
      7,
      1,
      10,
      4,
      "정말 친절하고 안전하게 이사했습니다"
    );
    expect(mockedRepository.confirmOwned).not.toHaveBeenCalled();
    expect(result.avgRating).toBe(4.5);
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

describe("reviewService.addImage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("PENDING 본인 리뷰에 사진을 올리고 URL을 반환한다", async () => {
    mockedRepository.findById.mockResolvedValue(pendingReview as never);
    mockedRepository.countImages.mockResolvedValue(1);
    mockedUpload.mockResolvedValue("https://cdn.example/new.jpg");
    mockedRepository.createImage.mockResolvedValue({
      status: "ok",
      imageUrl: "https://cdn.example/new.jpg",
    });

    const result = await reviewService.addImage(1, 7, png);

    expect(mockedUpload).toHaveBeenCalledWith(7, png, {
      mimeType: "image/png",
      extension: "png",
    });
    expect(mockedRepository.createImage).toHaveBeenCalledWith(7, 1, "https://cdn.example/new.jpg");
    expect(result).toEqual({ imageUrl: "https://cdn.example/new.jpg" });
  });

  it("이미 3장이면 업로드하지 않고 400을 던진다", async () => {
    mockedRepository.findById.mockResolvedValue(pendingReview as never);
    mockedRepository.countImages.mockResolvedValue(3);

    await expect(reviewService.addImage(1, 7, png)).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it("매직 넘버가 아니면 400이고 업로드하지 않는다", async () => {
    mockedRepository.findById.mockResolvedValue(pendingReview as never);

    await expect(reviewService.addImage(1, 7, Buffer.from("not-an-image"))).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it("확정된 리뷰에도 사진을 올린다", async () => {
    mockedRepository.findById.mockResolvedValue({ ...pendingReview, status: "CONFIRMED" } as never);
    mockedRepository.countImages.mockResolvedValue(0);
    mockedUpload.mockResolvedValue("https://cdn.example/new.jpg");
    mockedRepository.createImage.mockResolvedValue({
      status: "ok",
      imageUrl: "https://cdn.example/new.jpg",
    });

    const result = await reviewService.addImage(1, 7, png);

    expect(result).toEqual({ imageUrl: "https://cdn.example/new.jpg" });
  });

  it("본인 리뷰가 아니면 403을 던진다", async () => {
    mockedRepository.findById.mockResolvedValue({ ...pendingReview, customerId: 2 } as never);

    await expect(reviewService.addImage(1, 7, png)).rejects.toMatchObject({
      statusCode: 403,
      code: ERROR_CODES.FORBIDDEN,
    });
  });
});

describe("reviewService.removeImage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("PENDING 리뷰의 사진을 지운다", async () => {
    mockedRepository.findById.mockResolvedValue(pendingReview as never);
    mockedRepository.deleteImage.mockResolvedValue({ status: "ok" });

    await reviewService.removeImage(1, 7, "https://cdn.example/1.jpg");

    expect(mockedRepository.deleteImage).toHaveBeenCalledWith(7, 1, "https://cdn.example/1.jpg");
  });

  it("확정된 리뷰의 사진도 지운다", async () => {
    mockedRepository.findById.mockResolvedValue({ ...pendingReview, status: "CONFIRMED" } as never);
    mockedRepository.deleteImage.mockResolvedValue({ status: "ok" });

    await reviewService.removeImage(1, 7, "https://cdn.example/1.jpg");

    expect(mockedRepository.deleteImage).toHaveBeenCalledWith(7, 1, "https://cdn.example/1.jpg");
  });

  it("없는 사진이면 404를 던진다", async () => {
    mockedRepository.findById.mockResolvedValue(pendingReview as never);
    mockedRepository.deleteImage.mockResolvedValue({ status: "missing" });

    await expect(
      reviewService.removeImage(1, 7, "https://cdn.example/missing.jpg")
    ).rejects.toMatchObject({ statusCode: 404, code: ERROR_CODES.NOT_FOUND });
  });
});
