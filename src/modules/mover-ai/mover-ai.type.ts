import type { RegionType, ServiceType } from "../../../generated/prisma/enums.ts";
import type { MoverListItemResponse } from "../mover/mover.type";
import type { MoverAiRegionClarify } from "./mover-ai.region";

export type { MoverAiRegionClarify, MoverAiRegionOption } from "./mover-ai.region";

/** 대화 상태머신 */
export type MoverAiNextAction =
  | "ASK_REGION"
  | "ASK_SERVICE"
  | "ASK_MODE"
  | "ASK_SORT"
  | "SHOW_MOVERS"
  | "SHOW_RECOMMENDATION"
  | "CLARIFY_UNSUPPORTED"
  | "CLARIFY_REGION";

/** 지역·유형 다음 갈림. browse는 정렬 후 목록, recommend는 한 명 추천 */
export type MoverAiListMode = "browse" | "recommend";

/** 슬롯 채움 상태만으로 결정되는 단계 */
export type MoverAiSlotAction = Exclude<
  MoverAiNextAction,
  "CLARIFY_UNSUPPORTED" | "CLARIFY_REGION" | "SHOW_RECOMMENDATION"
>;

export type MoverAiSort = "rating" | "review" | "career" | "confirmed";

/** 화면 언어. 없으면 한국어로 처리합니다. */
export type MoverAiLocale = "ko" | "en" | "zh" | "ja";

/** 프론트가 고정 문구를 고를 때 쓰는 키. 서버는 한국어 문장을 content에 그대로 저장합니다. */
export type MoverAiSpeechTemplate =
  | "welcome"
  | "askRegion"
  | "askRegionNext"
  | "askService"
  | "askServiceNext"
  | "askMode"
  | "askSort"
  | "showMovers"
  | "showMoversMore"
  | "showMoversEmpty"
  | "recommend"
  | "recommendOnly"
  | "noMover"
  | "clarifyRegion"
  | "changeFilters"
  | "resetRegion"
  | "resetService"
  | "favoriteCreated"
  | "favoriteAlready"
  | "favoritePartial"
  | "favoriteOne"
  | "favoriteOneAlready"
  | "geminiFallback"
  | "lastMovers";

/** 화면이 말풍선을 조립하는 재료 */
export interface MoverAiSpeech {
  source: "template" | "model";
  template: MoverAiSpeechTemplate | null;
  /** geminiFallback 뒤에 붙는 질문 */
  ask: MoverAiSpeechTemplate | null;
  unsupported: boolean;
  /** 목록의 마지막 페이지면 마지막 안내를 붙입니다 */
  closed: boolean;
  modelReply: string | null;
  reviewSummary: string | null;
  reviewSummaryState: "text" | "none" | "failed" | null;
  favoriteCount: number | null;
}

export type MoverAiMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

export type MoverAiClientActionType =
  | "SELECT_SERVICE"
  | "SELECT_SORT"
  | "SELECT_REGION"
  | "SHOW_MORE"
  | "CHANGE_FILTERS"
  | "FAVORITE_ALL"
  | "SELECT_MODE";

export interface MoverAiFilters {
  region: RegionType | null;
  service: ServiceType | null;
  sort: MoverAiSort | null;
}

export interface MoverAiChip {
  id: string;
  label: string;
  action: MoverAiClientActionType;
  value: string | null;
}

export interface MoverAiUi {
  nextAction: MoverAiNextAction;
  chips: MoverAiChip[] | null;
  movers: MoverListItemResponse[] | null;
  listMeta: { nextCursor: string | null; hasNext: boolean } | null;
  /** 없으면 저장된 content를 그대로 보여 줍니다 */
  speech: MoverAiSpeech | null;
}

export interface MoverAiMessageView {
  id: string;
  role: MoverAiMessageRole;
  content: string;
  ui?: MoverAiUi;
}

export interface MoverAiFavoriteResult {
  favoritedCount: number;
  skippedCount: number;
}

/** Gemini structured JSON (zod 재검증 전) */
export interface GeminiMoverAiResult {
  reply: string;
  filters: MoverAiFilters;
  nextAction: MoverAiNextAction;
}

export interface CreateSessionResult {
  sessionId: string;
  messages: MoverAiMessageView[];
}

export interface PostMessageResult {
  sessionId: string;
  assistantMessage: MoverAiMessageView;
  filters: MoverAiFilters;
  favoriteResult?: MoverAiFavoriteResult;
}

export interface GetSessionResult {
  sessionId: string;
  filters: MoverAiFilters;
  messages: MoverAiMessageView[];
}

/** ASSISTANT payload 스냅샷 */
export interface MoverAiAssistantPayload {
  filters: MoverAiFilters;
  nextAction: MoverAiNextAction;
  regionClarify?: MoverAiRegionClarify | null;
  /** 중의 지역 칩을 화면 언어로 옮긴 이름. 매칭은 한국어 label을 유지합니다. */
  regionDisplayLabels?: string[] | null;
  speech?: MoverAiSpeech | null;
  moverIds?: number[];
  listMeta?: { nextCursor: string | null; hasNext: boolean } | null;
  favoriteResult?: MoverAiFavoriteResult;
  listMode?: MoverAiListMode | null;
  /** 같은 지역·유형 후보 수. 1이면 비교 칩을 붙이지 않습니다. */
  candidateCount?: number;
  recommendation?: {
    moverId: number;
    onlyOne: boolean;
    reason: string;
    reviewSummary: string | null;
  };
}
