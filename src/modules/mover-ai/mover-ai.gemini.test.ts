import { isRetryableGeminiError } from "./mover-ai.gemini";

describe("isRetryableGeminiError", () => {
  it("503·과부하·429는 재시도 대상이다", () => {
    expect(isRetryableGeminiError(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))).toBe(
      true
    );
    expect(isRetryableGeminiError(new Error("high demand"))).toBe(true);
    expect(isRetryableGeminiError(new Error("429 RESOURCE_EXHAUSTED"))).toBe(true);
  });

  it("스키마·파싱 오류는 재시도하지 않는다", () => {
    expect(isRetryableGeminiError(new Error("AI 응답 형식이 올바르지 않습니다"))).toBe(false);
    expect(isRetryableGeminiError(new Error("INVALID_ARGUMENT"))).toBe(false);
  });
});
