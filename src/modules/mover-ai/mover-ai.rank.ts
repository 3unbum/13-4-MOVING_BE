/** 추천 점수에 쓰는 기사님 지표. 평점·경력·확정은 단위가 달라 그대로 더하지 않습니다. */
export type RankScores = {
  userId: number;
  avgRating: number;
  reviewCount: number;
  career: number;
  confirmedCount: number;
};

/** 리뷰가 적어도 평점이 치솟지 않도록 가정하는 리뷰 수 */
const PRIOR_WEIGHT = 5;
/** 리뷰가 없을 때 기대하는 평점. 후보수 평균을 쓰면 만점 1개가 다수 리뷰보다 높아집니다. */
const PRIOR_MEAN = 4;

/** 리뷰 수를 반영한 보정 평점 */
export function bayesianRating(
  avgRating: number,
  reviewCount: number,
  priorMean = PRIOR_MEAN
): number {
  return (reviewCount * avgRating + PRIOR_WEIGHT * priorMean) / (reviewCount + PRIOR_WEIGHT);
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 1;
  return (value - min) / (max - min);
}

function isBetterTie(left: RankScores, right: RankScores): boolean {
  if (left.confirmedCount !== right.confirmedCount)
    return left.confirmedCount > right.confirmedCount;
  if (left.career !== right.career) return left.career > right.career;
  return left.userId < right.userId;
}

/**
 * 같은 지역·유형 후보 안에서 한 명을 고릅니다.
 * 보정 평점, 경력, 확정 수를 각각 0~1로 맞춘 뒤 같은 비중으로 더합니다.
 */
export function pickBestMover<T extends RankScores>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;

  const scored = candidates.map((candidate) => ({
    candidate,
    bayes: bayesianRating(candidate.avgRating, candidate.reviewCount),
  }));
  const bayesValues = scored.map((row) => row.bayes);
  const careerValues = candidates.map((candidate) => candidate.career);
  const confirmedValues = candidates.map((candidate) => candidate.confirmedCount);
  const minBayes = Math.min(...bayesValues);
  const maxBayes = Math.max(...bayesValues);
  const minCareer = Math.min(...careerValues);
  const maxCareer = Math.max(...careerValues);
  const minConfirmed = Math.min(...confirmedValues);
  const maxConfirmed = Math.max(...confirmedValues);

  let best = scored[0];
  let bestScore = -1;

  for (const row of scored) {
    const score =
      (normalize(row.bayes, minBayes, maxBayes) +
        normalize(row.candidate.career, minCareer, maxCareer) +
        normalize(row.candidate.confirmedCount, minConfirmed, maxConfirmed)) /
      3;
    const tied = Math.abs(score - bestScore) <= 1e-9;
    if (
      score > bestScore + 1e-9 ||
      (tied &&
        (row.bayes > best.bayes + 1e-9 ||
          (Math.abs(row.bayes - best.bayes) <= 1e-9 && isBetterTie(row.candidate, best.candidate))))
    ) {
      best = row;
      bestScore = score;
    }
  }

  return best.candidate;
}
