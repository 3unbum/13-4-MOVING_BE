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
