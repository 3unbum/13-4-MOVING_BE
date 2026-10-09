import type { RegionType, ServiceType } from "../../../generated/prisma/enums.ts";
import type { MoverListItemResponse } from "../mover/mover.type";
import type { MoverAiRegionClarify } from "./mover-ai.region";

export type { MoverAiRegionClarify, MoverAiRegionOption } from "./mover-ai.region";

/** 대화 상태머신 */
export type MoverAiNextAction =
  | "ASK_REGION"
  | "ASK_SERVICE"
  | "ASK_SORT"
  | "SHOW_MOVERS"
  | "CLARIFY_UNSUPPORTED"
  | "CLARIFY_REGION";

/** 슬롯 채움 상태만으로 결정되는 단계 */
export type MoverAiSlotAction = Exclude<
  MoverAiNextAction,
  "CLARIFY_UNSUPPORTED" | "CLARIFY_REGION"
>;

export type MoverAiSort = "rating" | "review" | "career" | "confirmed";

export type MoverAiMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

export type MoverAiClientActionType =
  | "SELECT_SERVICE"
  | "SELECT_SORT"
  | "SELECT_REGION"
  | "SHOW_MORE"
  | "CHANGE_FILTERS"
  | "FAVORITE_ALL";

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
}
