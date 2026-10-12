import { GoogleGenAI, Type } from "@google/genai";
import { RegionType, ServiceType } from "../../../generated/prisma/enums.ts";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { env } from "../../config/env";
import { geminiMoverAiResultSchema } from "./mover-ai.schema";
import type { GeminiMoverAiResult, MoverAiFilters } from "./mover-ai.type";

const REGION_ENUM = [null, ...Object.values(RegionType)];
const SERVICE_ENUM = [null, ...Object.values(ServiceType)];
const SORT_ENUM = [null, "rating", "review", "career", "confirmed"] as const;
const NEXT_ACTION_ENUM = [
  "ASK_REGION",
  "ASK_SERVICE",
  "ASK_SORT",
  "SHOW_MOVERS",
  "CLARIFY_UNSUPPORTED",
  "CLARIFY_REGION",
] as const;

/** 모델당 최대 시도 횟수 (과부하·일시 장애) */
const MAX_ATTEMPTS_PER_MODEL = 2;
const BASE_BACKOFF_MS = 1000;
/** 호출 1회 타임아웃 */
const CALL_TIMEOUT_MS = 10_000;
/** 재시도·폴백을 모두 합친 상한. 유저가 채팅 응답을 기다리는 시간이므로 길게 두지 않습니다. */
const TOTAL_DEADLINE_MS = 20_000;

const SYSTEM_PROMPT = `당신은 이사 매칭 서비스 "무빙"의 기사님 찾기 어시스턴트입니다.
유저와 짧게 대화하며 검색 조건(슬롯)만 수집합니다. 기사 목록·이름·평점은 절대 지어내지 마세요.

## 슬롯 (region = 이사 **도착지** 광역)
- region: RegionType enum (SEOUL, GYEONGGI, …) 또는 null
  - 시·군(유일) → 광역. 예: 용인/수원 → GYEONGGI, 강남/마포 → SEOUL.
  - 중의 지명(구미·죽전·광주·고성 등)은 **추측 금지**. region=null, nextAction=ASK_REGION. reply로 "어느 시·도인지" 짧게 되묻기.
  - "경북 구미", "용인 죽전"처럼 구체화되면 해당 광역으로.
  - 모르는 지명도 region=null, nextAction=ASK_REGION.
- service: SMALL | HOME | OFFICE 또는 null — **"소형이사/가정이사/사무실이사"** 명확할 때만.
- sort: rating | review | career | confirmed 또는 null

## nextAction
- ASK_REGION / ASK_SERVICE / ASK_SORT / SHOW_MOVERS — 빈 슬롯 기준
- CLARIFY_UNSUPPORTED: 가격·일정. 슬롯은 유지하고 reply로 그 조건은 아직 찾을 수 없다고 짧게 안내.
- CLARIFY_REGION: 쓰지 마세요. 중의·불명은 ASK_REGION으로.

## 규칙
1. 이번에 언급된 슬롯만 갱신. 나머지는 현재 슬롯 유지.
2. reply는 2문장 이내 한국어. UI 칩 문구 금지.
3. reply와 nextAction 일치. service 비면 정렬 묻지 말 것.
4. 가격·일정 → nextAction=CLARIFY_UNSUPPORTED. filters는 현재 슬롯 유지.
5. 오프토픽: filters 유지, ASK_* 로 다음 슬롯만 되묻기.
6. JSON만 출력.`;

/** Gemini JSON Schema (structured output) */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    filters: {
      type: Type.OBJECT,
      properties: {
        region: { type: Type.STRING, nullable: true, enum: REGION_ENUM },
        service: { type: Type.STRING, nullable: true, enum: SERVICE_ENUM },
        sort: { type: Type.STRING, nullable: true, enum: [...SORT_ENUM] },
      },
      required: ["region", "service", "sort"],
    },
    nextAction: { type: Type.STRING, enum: [...NEXT_ACTION_ENUM] },
  },
  required: ["reply", "filters", "nextAction"],
};

function assertApiKey() {
  if (!env.GEMINI_API_KEY) {
    throw new AppError(503, ERROR_CODES.INTERNAL_ERROR, "GEMINI_API_KEY가 설정되지 않았습니다");
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 과부하·할당량·일시 장애만 재시도 대상으로 봅니다. */
export function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  return /503|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|429|DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|aborted/i.test(
    message
  );
}

function parseAndValidate(rawText: string): GeminiMoverAiResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new AppError(502, ERROR_CODES.INTERNAL_ERROR, "AI 응답 JSON을 파싱하지 못했습니다");
  }

  const result = geminiMoverAiResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError(502, ERROR_CODES.INTERNAL_ERROR, "AI 응답 형식이 올바르지 않습니다");
  }

  return result.data;
}

async function generateOnce(
  ai: GoogleGenAI,
  model: string,
  userPrompt: string,
  timeoutMs: number
): Promise<string> {
  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });
  return response.text ?? "";
}

/** 동일 모델에서 재시도 후, 실패 시 폴백 모델로 한 번 더 시도합니다. */
async function generateWithRetryAndFallback(
  ai: GoogleGenAI,
  userPrompt: string
): Promise<{ rawText: string; model: string }> {
  const models = [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL].filter(
    (model, index, all) => model.length > 0 && all.indexOf(model) === index
  );

  const deadline = Date.now() + TOTAL_DEADLINE_MS;
  let lastError: unknown;

  outer: for (const model of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break outer;

      try {
        const rawText = await generateOnce(
          ai,
          model,
          userPrompt,
          Math.min(CALL_TIMEOUT_MS, remaining)
        );
        return { rawText, model };
      } catch (error) {
        lastError = error;
        if (!isRetryableGeminiError(error) || attempt === MAX_ATTEMPTS_PER_MODEL) {
          break;
        }
        const backoff = BASE_BACKOFF_MS * attempt;
        if (deadline - Date.now() <= backoff) break outer;
        await sleep(backoff);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Gemini 호출 실패";
  throw new AppError(502, ERROR_CODES.INTERNAL_ERROR, `AI 응답을 받지 못했습니다: ${message}`);
}

export async function callMoverAiGemini(params: {
  currentFilters: MoverAiFilters;
  history: { role: string; content: string }[];
  userMessage: string;
}): Promise<GeminiMoverAiResult> {
  assertApiKey();

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  const historyText = params.history.map((m) => `${m.role}: ${m.content}`).join("\n");

  const userPrompt = `## 현재 슬롯
${JSON.stringify(params.currentFilters)}

## 최근 대화
${historyText || "(없음)"}

## 유저 메시지
${params.userMessage}`;

  const { rawText } = await generateWithRetryAndFallback(ai, userPrompt);
  return parseAndValidate(rawText);
}
