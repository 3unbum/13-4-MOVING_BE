/** 세 provider(Google/Kakao/Naver) 응답을 정규화한 공용 형태 */
export type OAuthProviderProfile = {
  providerId: string;
  email: string;
  /** 콘솔에서 필수 동의 항목으로 걸어둬도 외부 API 응답이라 방어적으로 빈 문자열 fallback을 둠 */
  name: string;
  profileImage: string | null;
};
