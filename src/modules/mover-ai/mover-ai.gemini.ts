import { GoogleGenAI, Type } from "@google/genai";
import { RegionType, ServiceType } from "../../../generated/prisma/enums.ts";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { env } from "../../config/env";
import { geminiMoverAiResultSchema } from "./mover-ai.schema";
import type { GeminiMoverAiResult, MoverAiFilters, MoverAiLocale } from "./mover-ai.type";

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
- CLARIFY_UNSUPPORTED: 가격·일정·검색과 무관한 말. 슬롯은 유지합니다.
- CLARIFY_REGION: 쓰지 마세요. 중의·불명은 ASK_REGION으로.

## 규칙
1. 이번에 언급된 슬롯만 갱신. 나머지는 현재 슬롯 유지.
2. reply는 2문장 이내 한국어. UI 칩 문구 금지.
3. reply와 nextAction 일치. service 비면 정렬 묻지 말 것.
4. 가격·일정·검색과 무관한 말 → nextAction=CLARIFY_UNSUPPORTED. filters는 현재 슬롯 유지.
5. 같은 조건으로 다시 보여달라는 말 → 슬롯 유지, nextAction=SHOW_MOVERS.
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
  timeoutMs: number,
  systemInstruction: string
): Promise<string> {
  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });
  return response.text ?? "";
}

/** 동일 모델에서 재시도 후, 실패 시 폴백 모델로 한 번 더 시도합니다. */
const LOCALE_NAME: Record<Exclude<MoverAiLocale, "ko">, string> = {
  en: "English",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
};

/** 리뷰가 한국어여도 요약문 언어를 고정하기 위한 지시 */
const REVIEW_SUMMARY_LOCALE: Record<Exclude<MoverAiLocale, "ko">, string> = {
  en: "English",
  zh: "Simplified Chinese (简体中文)",
  ja: "Japanese (日本語)",
};

/** 슬롯 판단은 한국어 규칙을 유지하고, reply만 화면 언어로 바꿉니다. */
function systemPromptFor(locale: MoverAiLocale): string {
  if (locale === "ko") return SYSTEM_PROMPT;
  return SYSTEM_PROMPT.replace(
    "2. reply는 2문장 이내 한국어. UI 칩 문구 금지.",
    `2. reply는 2문장 이내 ${LOCALE_NAME[locale]}로 작성. UI 칩 문구 금지. enum 값은 바꾸지 마세요.`
  );
}

async function generateWithRetryAndFallback(
  ai: GoogleGenAI,
  userPrompt: string,
  systemInstruction: string = SYSTEM_PROMPT
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
          Math.min(CALL_TIMEOUT_MS, remaining),
          systemInstruction
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
  locale?: MoverAiLocale;
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

  const { rawText } = await generateWithRetryAndFallback(
    ai,
    userPrompt,
    systemPromptFor(params.locale ?? "ko")
  );
  return parseAndValidate(rawText);
}

const REVIEW_SUMMARY_PROMPT = `이사 기사님의 확정 리뷰만 보고 두 문장 이내 한국어로 요약하세요.
주어진 문장에 없는 평점, 사건, 이름은 지어내지 마세요. 요약문만 출력하세요.`;

function reviewSummaryPrompt(locale: MoverAiLocale): string {
  if (locale === "ko") return REVIEW_SUMMARY_PROMPT;
  const language = REVIEW_SUMMARY_LOCALE[locale];
  return `You summarize confirmed mover reviews for a moving app.
Write the entire summary in ${language} only.
The source reviews are Korean. Translate the meaning into ${language}.
Do not output Korean Hangul at all.
Do not invent ratings, events, or names that are not in the text.
At most two sentences. Output only the summary.`;
}

/** 확정 리뷰 본문만 받아 짧은 요약을 만듭니다. 실패하면 null을 반환해 추천 사유만 남깁니다. */
export async function summarizeReviewComments(
  comments: string[],
  locale: MoverAiLocale = "ko"
): Promise<string | null> {
  if (!env.GEMINI_API_KEY || comments.length === 0) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const numbered = comments.map((comment, index) => `${index + 1}. ${comment}`).join("\n");
    const language = locale === "ko" ? "한국어" : REVIEW_SUMMARY_LOCALE[locale];
    const contents =
      locale === "ko"
        ? numbered
        : `Source language: Korean\nTarget language: ${language}\nWrite the summary in ${language} only. Do not use Korean.\n\nReviews:\n${numbered}`;
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: reviewSummaryPrompt(locale),
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      },
    });
    const text = response.text?.trim();
    return text ? text.slice(0, 500) : null;
  } catch {
    return null;
  }
}

const TRANSLATE_PROMPT = `다음 문장을 한국어로만 번역하세요.
지명은 한국어 지명으로 옮기세요. 어느 시·도인지는 정하지 마세요.
광주, 죽전처럼 여러 지역에 있는 이름은 그 이름만 적으세요.
설명 없이 번역문만 출력하세요.`;

/** 한국어가 아닌 입력을 기존 규칙에 넣기 위해 한국어로 바꿉니다. 실패하면 null입니다. */
export async function translateToKorean(message: string): Promise<string | null> {
  if (!env.GEMINI_API_KEY) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: message,
      config: {
        systemInstruction: TRANSLATE_PROMPT,
        temperature: 0,
        abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      },
    });
    const text = response.text?.trim();
    return text ? text.slice(0, 1000) : null;
  } catch {
    return null;
  }
}

function parseLabelArray(raw: string, length: number): string[] | null {
  const trimmed = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/, "");
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.length !== length) return null;
    if (!parsed.every((item) => typeof item === "string" && item.trim().length > 0)) return null;
    return parsed.map((item) => (item as string).trim());
  } catch {
    return null;
  }
}

/** 중의 지역 후보 이름만 화면 언어로 옮깁니다. 순서가 다르면 쓰지 않습니다. */
export async function translatePlaceLabels(
  labels: string[],
  locale: MoverAiLocale
): Promise<string[] | null> {
  if (!env.GEMINI_API_KEY || labels.length === 0 || locale === "ko") return null;

  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: JSON.stringify(labels),
      config: {
        systemInstruction: `Translate each Korean place name into ${LOCALE_NAME[locale]}.
Return a JSON array of strings with the same length and order.
Do not choose a province or add explanations.`,
        temperature: 0,
        abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      },
    });
    const text = response.text?.trim();
    return text ? parseLabelArray(text, labels.length) : null;
  } catch {
    return null;
  }
}
