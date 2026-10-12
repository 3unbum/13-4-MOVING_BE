import { bayesianRating, pickBestMover, type RankScores } from "./mover-ai.rank";

function candidate(overrides: Partial<RankScores>): RankScores {
  return {
    userId: 1,
    avgRating: 4.5,
    reviewCount: 10,
    career: 5,
    confirmedCount: 8,
    ...overrides,
  };
}

describe("pickBestMover", () => {
  it("리뷰 1개의 만점보다 리뷰가 많은 평점을 더 높게 본다", () => {
    const lonelyFive = candidate({
      userId: 1,
      avgRating: 5,
      reviewCount: 1,
      career: 5,
      confirmedCount: 8,
    });
    const steady = candidate({
      userId: 2,
      avgRating: 4.8,
      reviewCount: 40,
      career: 5,
      confirmedCount: 8,
    });

    expect(bayesianRating(5, 1)).toBeLessThan(bayesianRating(4.8, 40));
    expect(pickBestMover([lonelyFive, steady])?.userId).toBe(2);
  });

  it("보정 평점이 같으면 경력과 확정이 높은 기사님을 고른다", () => {
    const junior = candidate({ userId: 1, career: 2, confirmedCount: 3 });
    const senior = candidate({ userId: 2, career: 15, confirmedCount: 40 });

    expect(pickBestMover([junior, senior])?.userId).toBe(2);
  });

  it("후보가 한 명이면 그 기사님을 반환한다", () => {
    const only = candidate({ userId: 7 });
    expect(pickBestMover([only])).toEqual(only);
  });

  it("후보가 없으면 null이다", () => {
    expect(pickBestMover([])).toBeNull();
  });
});
