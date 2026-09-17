import type { Prisma } from "../../../generated/prisma/client.ts";
import { estimateInclude, moverRequestInclude } from "./estimate.repository";

/// estimate.repository의 estimateInclude로 조회한 결과 타입.
/// typeof로 실제 include를 참조하므로, 필드를 추가/삭제해도 이 타입이 자동으로 따라옵니다.
export type EstimateWithMover = Prisma.EstimateGetPayload<{
  include: typeof estimateInclude;
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

/// moverRequestInclude로 조회한 받은 요청 타입.
export type MoverRequestWithUser = Prisma.QuotationRequestGetPayload<{
  include: ReturnType<typeof moverRequestInclude>;
}>;

/// 받은 요청 응답 — 카드가 쓰는 형태로 고객 이름과 지정 여부를 평탄화합니다.
///
/// 중첩(`user.name`)을 그대로 두면 호출부마다 옵셔널 체이닝이 붙고, user 객체가
/// 통째로 노출돼 필드가 늘어날 때 새어나갈 여지가 생깁니다.
///
/// `targetedRequests`는 moverId로 걸러 담기므로(estimate.repository) 존재 여부만
/// 보면 됩니다. 배열을 그대로 내보내면 프론트가 의미를 다시 해석해야 합니다.
export function toMoverRequestResponse(request: MoverRequestWithUser) {
  const { user, targetedRequests, ...rest } = request;

  return { ...rest, userName: user.name, isTargeted: targetedRequests.length > 0 };
}

export function toMoverRequestListResponse(requests: MoverRequestWithUser[]) {
  return requests.map(toMoverRequestResponse);
}
