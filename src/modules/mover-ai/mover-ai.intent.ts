/** 조건·슬롯을 말로 바꾸려는 의도 — Gemini 없이 BE에서 처리합니다
 * 메시지에서 의도를 추론하여 관련된 슬롯을 초기화합니다
 */
export type FilterResetIntent = "ALL" | "REGION" | "SERVICE";

export function inferFilterResetIntent(message: string): FilterResetIntent | null {
  const compact = message.replace(/\s/g, "");

  if (/(조건).{0,6}(바꿀|바꾸|다시)|처음부터|다시설정|(조건).{0,4}초기화/.test(compact)) {
    return "ALL";
  }

  // "지역 바꿀게" / "다른 지역" — "아니요, 지역은 @@"처럼 단순 언급은 제외
  if (
    /(지역).{0,10}(바꿀|바꾸|변경|다시)|((바꿀|바꾸|변경).{0,10}지역)|다른지역|지역말고/.test(
      compact
    )
  ) {
    return "REGION";
  }

  if (
    /(유형|종류).{0,10}(바꿀|바꾸|변경|다시)|((바꿀|바꾸).{0,10}(유형|종류))|이사유형.*(바꿀|바꾸)|다른유형/.test(
      compact
    )
  ) {
    return "SERVICE";
  }

  return null;
}
