import type {
  MoverAiChip,
  MoverAiFilters,
  MoverAiListMode,
  MoverAiNextAction,
  MoverAiRegionClarify,
  MoverAiSlotAction,
  MoverAiSpeech,
  MoverAiUi,
} from "./mover-ai.type";
import type { MoverListItemResponse } from "../mover/mover.type";

const SERVICE_CHIPS: MoverAiChip[] = [
  { id: "service_small", label: "소형이사", action: "SELECT_SERVICE", value: "SMALL" },
  { id: "service_home", label: "가정이사", action: "SELECT_SERVICE", value: "HOME" },
  { id: "service_office", label: "사무실이사", action: "SELECT_SERVICE", value: "OFFICE" },
];

const SORT_CHIPS: MoverAiChip[] = [
  { id: "sort_rating", label: "평점 높은 순", action: "SELECT_SORT", value: "rating" },
  { id: "sort_review", label: "리뷰 많은 순", action: "SELECT_SORT", value: "review" },
  { id: "sort_career", label: "경력 많은 순", action: "SELECT_SORT", value: "career" },
  { id: "sort_confirmed", label: "확정 많은 순", action: "SELECT_SORT", value: "confirmed" },
];

const RECOMMEND_CHIP: MoverAiChip = {
  id: "mode_recommend",
  label: "기사님 한 명 추천받기",
  action: "SELECT_MODE",
  value: "recommend",
};

const BROWSE_CHIP: MoverAiChip = {
  id: "mode_browse",
  label: "목록에서 직접 고르기",
  action: "SELECT_MODE",
  value: "browse",
};

const MODE_CHIPS: MoverAiChip[] = [RECOMMEND_CHIP, BROWSE_CHIP];

const RESET_CHIP: MoverAiChip = {
  id: "reset",
  label: "조건 바꾸기",
  action: "CHANGE_FILTERS",
  value: null,
};

/** 슬롯 단계별 칩. 가격·일정 안내(CLARIFY) 뒤에도 같은 칩을 보여줘야 서비스 선택 흐름이 끊기지 않습니다. */
function chipsForSlotAction(slotAction: MoverAiSlotAction): MoverAiChip[] | null {
  if (slotAction === "ASK_SERVICE") return SERVICE_CHIPS;
  if (slotAction === "ASK_MODE") return MODE_CHIPS;
  if (slotAction === "ASK_SORT") return SORT_CHIPS;
  if (slotAction === "SHOW_MOVERS") return [RESET_CHIP];
  return null;
}

function chipsForRegionClarify(
  clarify: MoverAiRegionClarify | null | undefined,
  displayLabels?: string[] | null
): MoverAiChip[] | null {
  if (!clarify || clarify.options.length === 0) return null;
  return clarify.options.map((option, index) => ({
    id: `region_${option.region}_${index}`,
    label: displayLabels?.[index] ?? option.label,
    action: "SELECT_REGION" as const,
    value: option.region,
  }));
}

/** nextAction 기준으로 FE 칩·movers UI를 조립합니다. Gemini는 칩을 만들지 않습니다. */
export function buildUi(params: {
  nextAction: MoverAiNextAction;
  filters?: MoverAiFilters | null;
  movers?: MoverListItemResponse[] | null;
  listMeta?: { nextCursor: string | null; hasNext: boolean } | null;
  regionClarify?: MoverAiRegionClarify | null;
  regionDisplayLabels?: string[] | null;
  candidateCount?: number | null;
  /** 가격 안내 뒤에도 정렬 칩을 유지하려면 목록/추천 선택이 필요합니다 */
  listMode?: MoverAiListMode | null;
  speech?: MoverAiSpeech | null;
}): MoverAiUi {
  const {
    nextAction,
    filters = null,
    movers = null,
    listMeta = null,
    regionClarify = null,
    regionDisplayLabels = null,
    candidateCount = null,
    listMode = null,
    speech = null,
  } = params;

  // ASK_REGION(첫 인사·조건 바꾸기 직후)은 칩 없이 발화만 받습니다. 유형/정렬 칩은 이후 단계에서만 노출합니다.
  if (nextAction === "ASK_SERVICE" || nextAction === "ASK_SORT") {
    return {
      nextAction,
      chips: chipsForSlotAction(nextAction),
      movers: null,
      listMeta: null,
      speech,
    };
  }

  if (nextAction === "ASK_MODE") {
    return {
      nextAction,
      chips: candidateCount === 0 ? [RESET_CHIP] : MODE_CHIPS,
      movers: null,
      listMeta: null,
      speech,
    };
  }

  if (nextAction === "CLARIFY_REGION") {
    return {
      nextAction,
      chips: chipsForRegionClarify(regionClarify, regionDisplayLabels),
      movers: null,
      listMeta: null,
      speech,
    };
  }

  if (nextAction === "CLARIFY_UNSUPPORTED") {
    const chips = filters ? chipsForSlotAction(resolveSlotAction(filters, listMode)) : null;
    return { nextAction, chips, movers: null, listMeta: null, speech };
  }

  if (nextAction === "SHOW_MOVERS") {
    const chips: MoverAiChip[] = [];
    if (movers && movers.length > 0) chips.push(RECOMMEND_CHIP);
    if (listMeta?.hasNext) {
      chips.push({ id: "more", label: "다른 기사님 더 보기", action: "SHOW_MORE", value: null });
    }
    if (movers && movers.length > 0) {
      chips.push({
        id: "fav",
        label: "기사님들 모두 찜하기",
        action: "FAVORITE_ALL",
        value: null,
      });
    }
    chips.push(RESET_CHIP);

    return {
      nextAction,
      chips,
      movers,
      listMeta,
      speech,
    };
  }

  if (nextAction === "SHOW_RECOMMENDATION") {
    const chips: MoverAiChip[] = [];
    if ((candidateCount ?? 0) > 1) chips.push(BROWSE_CHIP);
    if (movers && movers.length > 0) {
      chips.push({
        id: "fav",
        label: "이 기사님 찜하기",
        action: "FAVORITE_ALL",
        value: null,
      });
    }
    chips.push(RESET_CHIP);
    return { nextAction, chips, movers, listMeta: null, speech };
  }

  return { nextAction, chips: null, movers: null, listMeta: null, speech };
}

/**
 * 슬롯과 목록/추천 선택으로 다음 단계를 계산합니다.
 * 정렬이 비어 있고 아직 길을 고르지 않았으면 ASK_MODE입니다.
 */
export function resolveSlotAction(
  filters: MoverAiFilters,
  listMode: MoverAiListMode | null = null
): MoverAiSlotAction {
  if (!filters.region) return "ASK_REGION";
  if (!filters.service) return "ASK_SERVICE";
  if (!filters.sort) return listMode === "browse" ? "ASK_SORT" : "ASK_MODE";
  return "SHOW_MOVERS";
}

/**
 * 슬롯 채움 상태로 nextAction을 재계산합니다 (Gemini 제안보다 BE 우선).
 * Gemini의 CLARIFY_REGION은 후보 칩이 없어 ASK_REGION으로 내려 되묻습니다.
 */
export function resolveNextAction(
  filters: MoverAiFilters,
  suggested: MoverAiNextAction,
  listMode: MoverAiListMode | null = null
): MoverAiNextAction {
  if (suggested === "CLARIFY_UNSUPPORTED") {
    return "CLARIFY_UNSUPPORTED";
  }
  if (suggested === "CLARIFY_REGION") {
    return "ASK_REGION";
  }
  if (listMode === "recommend" && filters.region && filters.service && !filters.sort) {
    return "SHOW_RECOMMENDATION";
  }
  return resolveSlotAction(filters, listMode);
}

export const WELCOME_MESSAGE =
  "어떤 기사님을 찾고 계세요?\n이사 가실 지역과 이사 유형을 알려주시면 조건에 맞는 기사님을 찾아드릴게요☺️";
