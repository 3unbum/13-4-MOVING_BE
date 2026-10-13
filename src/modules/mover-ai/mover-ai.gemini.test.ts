import { isRetryableGeminiError, parseLabelArray } from "./mover-ai.gemini";

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

describe("parseLabelArray", () => {
  it("```json 과 일반 ``` 펜스를 떼고 배열을 읽는다", () => {
    expect(parseLabelArray('```json\n["a","b"]\n```', 2)).toEqual(["a", "b"]);
    expect(parseLabelArray('```\n["용인","대구"]\n```', 2)).toEqual(["용인", "대구"]);
    expect(parseLabelArray('["a","b"]', 2)).toEqual(["a", "b"]);
  });

  it("길이가 다르거나 JSON이 아니면 null이다", () => {
    expect(parseLabelArray('["a"]', 2)).toBeNull();
    expect(parseLabelArray("not-json", 1)).toBeNull();
  });
});
