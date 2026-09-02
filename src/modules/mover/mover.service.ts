import { AppError } from "@/common/errors/AppError";
import { moverRepository } from "./mover.repository";
import {
  REGION_LABELS,
  SERVICE_LABELS,
  type MoverDetailResponse,
  type MoverDetailViewer,
} from "./mover.type";

/**
 * DB에서 조회한 기사님 상세 정보를 프론트엔드 응답 스펙(DTO)으로 정제 및 매핑
 */
function mapToMoverDetailDTO(
  user: NonNullable<Awaited<ReturnType<typeof moverRepository.findDetailByUserId>>>
): MoverDetailResponse {
  const profile = user.moverProfile!;

  return {
    id: user.id,
    nickName: profile.nickName,
    image: profile.image,
    career: profile.career,
    bio: profile.bio,
    description: profile.description,
    avgRating: Number(profile.avgRating),
    reviewCount: profile.reviewCount,
    confirmedCount: profile.confirmedCount,
    favoriteCount: profile.favoriteCount,
    services: user.moverServices.map(({ service }) => SERVICE_LABELS[service]),
    regions: user.moverRegions.map(({ region }) => REGION_LABELS[region]),
  };
}

export const moverService = {
  async getById(moverId: number, viewer?: MoverDetailViewer): Promise<MoverDetailResponse> {
    const mover = await moverRepository.findDetailByUserId(moverId);

    if (!mover || mover.role !== "MOVER" || !mover.moverProfile) {
      throw AppError.notFound("기사님을 찾을 수 없습니다");
    }

    const detail = mapToMoverDetailDTO(mover);

    if (viewer?.role !== "CUSTOMER") {
      return detail;
    }

    const [isFavorited, isTargeted] = await Promise.all([
      moverRepository.existsFavorite(viewer.id, moverId),
      moverRepository.isTargetedInActiveRequest(viewer.id, moverId),
    ]);

    return { ...detail, isFavorited, isTargeted };
  },
};
