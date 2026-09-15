import type { Prisma } from "../../../generated/prisma/client.ts";

/// estimate.repository의 estimateInclude로 조회한 결과 타입.
/// include를 바꾸면 여기가 함께 따라오도록 Prisma 타입으로 유도합니다.
export type EstimateWithMover = Prisma.EstimateGetPayload<{
  include: {
    mover: {
      select: {
        id: true;
        name: true;
        moverProfile: {
          select: {
            image: true;
            nickName: true;
            career: true;
            bio: true;
            avgRating: true;
            reviewCount: true;
            confirmedCount: true;
            favoriteCount: true;
          };
        };
      };
    };
    quotationRequest: {
      select: {
        id: true;
        category: true;
        movingDate: true;
        createdAt: true;
        targetedRequests: { select: { moverId: true } };
      };
    };
  };
}>;

/// 견적 응답 — FE 견적 카드가 쓰는 형태로 평탄화합니다.
///
/// 중첩(`mover.moverProfile.nickName`)을 그대로 내보내면 호출부마다 옵셔널 체이닝이 붙고,
/// isTargeted 판별(지정 목록에 이 기사님이 있는지)이 FE 몫이 됩니다. 여기서 정리합니다.
export function toEstimateResponse(estimate: EstimateWithMover) {
  const { mover, quotationRequest, ...rest } = estimate;
  const profile = mover.moverProfile;

  return {
    ...rest,
    /// 요청에 지정된 기사님 목록에 이 견적의 기사님이 있으면 지정 견적입니다.
    isTargeted: quotationRequest.targetedRequests.some((t) => t.moverId === estimate.moverId),
    quotationRequest: {
      id: quotationRequest.id,
      category: quotationRequest.category,
      movingDate: quotationRequest.movingDate,
      createdAt: quotationRequest.createdAt,
    },
    mover: {
      id: mover.id,
      name: mover.name,
      /// 프로필은 기사님 가입 시 필수라 사실상 항상 있지만, 스키마상 nullable이라 방어합니다.
      image: profile?.image ?? null,
      nickName: profile?.nickName ?? mover.name,
      career: profile?.career ?? 0,
      bio: profile?.bio ?? "",
      /// Decimal(2,1) — JSON에 문자열로 나가지 않도록 number로 변환합니다.
      avgRating: profile ? Number(profile.avgRating) : 0,
      reviewCount: profile?.reviewCount ?? 0,
      confirmedCount: profile?.confirmedCount ?? 0,
      favoriteCount: profile?.favoriteCount ?? 0,
    },
  };
}

export function toEstimateListResponse(estimates: EstimateWithMover[]) {
  return estimates.map(toEstimateResponse);
}
