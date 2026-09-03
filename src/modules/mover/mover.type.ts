import type { RegionType, ServiceType, UserRole } from "../../../generated/prisma/enums.ts";

/** optionalAuth로 주입된 요청자 (service 레이어용) */
export type MoverDetailViewer = {
  id: number;
  role: UserRole;
};

/** 목록 정렬 기준 */
export type MoverListSort = "review" | "rating" | "career" | "confirmed";

/** 커서 페이지네이션용 — 정렬 키 + 동점자 처리 */
export interface MoverListCursor {
  profileId: number;
  userId: number;
  reviewCount: number;
  avgRating: number;
  career: number;
  confirmedCount: number;
}

/** repository 조회 파라미터 */
export interface FindMoverListParams {
  keyword?: string;
  region?: RegionType;
  service?: ServiceType;
  sort: MoverListSort;
  cursor?: MoverListCursor;
  limit: number;
}

/** API 응답용 한글 라벨 */
export const SERVICE_LABELS: Record<ServiceType, string> = {
  SMALL: "소형이사",
  HOME: "가정이사",
  OFFICE: "사무실이사",
};

export const REGION_LABELS: Record<RegionType, string> = {
  SEOUL: "서울",
  GYEONGGI: "경기",
  INCHEON: "인천",
  GANGWON: "강원",
  CHUNGBUK: "충북",
  CHUNGNAM: "충남",
  SEJONG: "세종",
  DAEJEON: "대전",
  JEONBUK: "전북",
  JEONNAM: "전남",
  GWANGJU: "광주",
  GYEONGBUK: "경북",
  GYEONGNAM: "경남",
  DAEGU: "대구",
  ULSAN: "울산",
  BUSAN: "부산",
  JEJU: "제주",
};

const REGION_LABEL_ENTRIES = Object.entries(REGION_LABELS) as [RegionType, string][];
const SERVICE_LABEL_ENTRIES = Object.entries(SERVICE_LABELS) as [ServiceType, string][];

export function parseRegionLabel(label: string): RegionType | null {
  return REGION_LABEL_ENTRIES.find(([, value]) => value === label)?.[0] ?? null;
}

export function parseServiceLabel(label: string): ServiceType | null {
  return SERVICE_LABEL_ENTRIES.find(([, value]) => value === label)?.[0] ?? null;
}

export interface MoverListItemResponse {
  id: number;
  nickName: string;
  image: string | null;
  career: number;
  avgRating: number;
  reviewCount: number;
  confirmedCount: number;
  favoriteCount: number;
  services: string[];
  regions: string[];
}

export interface MoverListResponse {
  data: MoverListItemResponse[];
  nextCursor: string | null;
  hasNext: boolean;
}

export interface MoverDetailResponse {
  id: number;
  nickName: string;
  image: string | null;
  career: number;
  bio: string;
  description: string;
  avgRating: number;
  reviewCount: number;
  confirmedCount: number;
  favoriteCount: number;
  services: string[];
  regions: string[];
  /** 로그인 일반 유저일 때만 포함 */
  isFavorited?: boolean;
  /** 로그인 + 활성 견적 요청 보유 시 포함 */
  isTargeted?: boolean;
}
