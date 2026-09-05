export interface ProfileImageUploadResult {
  /** 프로필 등록/수정 API의 image 필드에 그대로 전달할 S3 URL */
  imageUrl: string;
}

export interface CustomerAccountResponse {
  userId: number;
  role: "CUSTOMER";
  name: string;
  email: string;
  phoneNumber: string;
  /** 프로필 등록 완료 여부 — false면 아래 프로필 필드는 비어있습니다 */
  hasProfile: boolean;
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
  image: string | null;
  nickName: string | null;
  career: number | null;
  bio: string | null;
  description: string | null;
  avgRating: number | null;
  services: string[];
  regions: string[];
}
