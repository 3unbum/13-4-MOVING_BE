/** 세 provider(Google/Kakao/Naver) 응답을 정규화한 공용 형태 */
export interface OAuthProviderProfile {
  providerId: string;
  email: string;
  /** 카카오/네이버는 동의 항목에 따라 빈 문자열일 수 있음 */
  name: string;
  profileImage: string | null;
}
