import { confirmReviewSchema, reviewListQuerySchema } from "./review.schema";

describe("reviewListQuerySchema", () => {
  it("빈 쿼리를 통과시킨다", () => {
    expect(reviewListQuerySchema.safeParse({}).success).toBe(true);
  });

  it("take가 20을 넘으면 실패한다", () => {
    expect(reviewListQuerySchema.safeParse({ take: 21 }).success).toBe(false);
  });
});

describe("confirmReviewSchema", () => {
  it("평점과 코멘트를 통과시킨다", () => {
    expect(
      confirmReviewSchema.safeParse({ rating: 5, comment: "정말 친절하고 안전하게 이사했습니다" })
        .success
    ).toBe(true);
  });

  it("평점이 1 미만이면 실패한다", () => {
    expect(
      confirmReviewSchema.safeParse({ rating: 0, comment: "정말 친절하고 안전하게 이사했습니다" })
        .success
    ).toBe(false);
  });

  it("코멘트가 10자 미만이면 실패한다", () => {
    expect(confirmReviewSchema.safeParse({ rating: 5, comment: "좋아요" }).success).toBe(false);
  });
});
