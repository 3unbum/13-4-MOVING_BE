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
