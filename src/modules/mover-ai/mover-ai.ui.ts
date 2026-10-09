import type {
  MoverAiChip,
  MoverAiFilters,
  MoverAiNextAction,
  MoverAiRegionClarify,
  MoverAiSlotAction,
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

const RESET_CHIP: MoverAiChip = {
  id: "reset",
  label: "조건 바꾸기",
  action: "CHANGE_FILTERS",
  value: null,
};

/** 슬롯 단계별 칩. 가격·일정 안내(CLARIFY) 뒤에도 같은 칩을 보여줘야 서비스 선택 흐름이 끊기지 않습니다. */
function chipsForSlotAction(slotAction: MoverAiSlotAction): MoverAiChip[] | null {
  if (slotAction === "ASK_SERVICE") return SERVICE_CHIPS;
  if (slotAction === "ASK_SORT") return SORT_CHIPS;
  if (slotAction === "SHOW_MOVERS") return [RESET_CHIP];
  return null;
}

function chipsForRegionClarify(
  clarify: MoverAiRegionClarify | null | undefined
): MoverAiChip[] | null {
  if (!clarify || clarify.options.length === 0) return null;
  return clarify.options.map((option, index) => ({
    id: `region_${option.region}_${index}`,
    label: option.label,
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
}): MoverAiUi {
  const {
    nextAction,
    filters = null,
    movers = null,
    listMeta = null,
    regionClarify = null,
  } = params;

  // ASK_REGION(첫 인사·조건 바꾸기 직후)은 칩 없이 발화만 받습니다. 유형/정렬 칩은 이후 단계에서만 노출합니다.
  if (nextAction === "ASK_SERVICE" || nextAction === "ASK_SORT") {
    return { nextAction, chips: chipsForSlotAction(nextAction), movers: null, listMeta: null };
  }

  if (nextAction === "CLARIFY_REGION") {
    return {
      nextAction,
      chips: chipsForRegionClarify(regionClarify),
      movers: null,
      listMeta: null,
    };
  }

  if (nextAction === "CLARIFY_UNSUPPORTED") {
    const chips = filters ? chipsForSlotAction(resolveSlotAction(filters)) : null;
    return { nextAction, chips, movers: null, listMeta: null };
  }

  if (nextAction === "SHOW_MOVERS") {
    const chips: MoverAiChip[] = [];
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
    };
  }

  return { nextAction, chips: null, movers: null, listMeta: null };
}

/** 슬롯 채움 상태만으로 다음 단계를 계산합니다. */
export function resolveSlotAction(filters: MoverAiFilters): MoverAiSlotAction {
  if (!filters.region) return "ASK_REGION";
  if (!filters.service) return "ASK_SERVICE";
  if (!filters.sort) return "ASK_SORT";
  return "SHOW_MOVERS";
}

/**
 * 슬롯 채움 상태로 nextAction을 재계산합니다 (Gemini 제안보다 BE 우선).
 * Gemini의 CLARIFY_REGION은 후보 칩이 없어 ASK_REGION으로 내려 되묻습니다.
 */
export function resolveNextAction(
  filters: MoverAiFilters,
  suggested: MoverAiNextAction
): MoverAiNextAction {
  if (suggested === "CLARIFY_UNSUPPORTED") {
    return "CLARIFY_UNSUPPORTED";
  }
  if (suggested === "CLARIFY_REGION") {
    return "ASK_REGION";
  }
  return resolveSlotAction(filters);
}

export const WELCOME_MESSAGE =
  "어떤 기사님을 찾고 계세요?\n이사 가실 지역과 이사 유형을 알려주시면 조건에 맞는 기사님을 찾아드릴게요☺️";
