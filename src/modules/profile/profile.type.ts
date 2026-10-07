import type { RegionType, ServiceType } from "../../../generated/prisma/enums";

export interface ProfileImageUploadResult {
  /** 프로필 등록/수정 API의 image 필드에 그대로 전달할 S3 URL */
  imageUrl: string;
}

export interface CustomerProfileResponse {
  id: number;
  userId: number;
  image: string | null;
  region: string;
  services: string[];
}

export interface MoverProfileResponse {
  id: number;
  userId: number;
  image: string | null;
  nickName: string;
  career: number;
  bio: string;
  description: string;
  services: string[];
  regions: string[];
}

export interface CustomerAccountResponse {
  userId: number;
  role: "CUSTOMER";
  name: string;
  email: string;
  phoneNumber: string;
  /** 프로필 등록 완료 여부 — false면 아래 프로필 필드는 비어있습니다 */
  hasProfile: boolean;
  /** 비밀번호 보유 여부 — false면 소셜 로그인 계정 (비밀번호 변경/재확인 UI 숨김 처리용) */
  hasPassword: boolean;
  image: string | null;
  region: string | null;
  services: string[];
}

export interface MoverAccountResponse {
  userId: number;
  role: "MOVER";
  name: string;
  email: string;
  phoneNumber: string;
  hasProfile: boolean;
  /** 비밀번호 보유 여부 — false면 소셜 로그인 계정 (비밀번호 변경/재확인 UI 숨김 처리용) */
  hasPassword: boolean;
  image: string | null;
  nickName: string | null;
  career: number | null;
  bio: string | null;
  description: string | null;
  avgRating: number | null;
  services: string[];
  regions: string[];
}

export interface CustomerAccountUpdateInput {
  account: Partial<{ name: string; phoneNumber: string; password: string }>;
  /** image가 null이면 프로필 이미지를 삭제합니다 */
  profile: Partial<{ image: string | null; region: RegionType }>;
  /** undefined면 서비스 목록은 건드리지 않습니다 */
  services?: ServiceType[];
}

export interface MoverAccountUpdateInput {
  account: Partial<{ name: string; phoneNumber: string; password: string }>;
  profile: Partial<{
    /** null이면 프로필 이미지를 삭제합니다 */
    image: string | null;
    nickName: string;
    career: number;
    bio: string;
    description: string;
  }>;
  services?: ServiceType[];
  regions?: RegionType[];
}
