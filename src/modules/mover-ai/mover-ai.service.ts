import type { Prisma } from "../../../generated/prisma/client.ts";
import type { RegionType, ServiceType } from "../../../generated/prisma/enums.ts";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { favoriteService } from "../favorite/favorite.service";
import type { MoverListItemResponse } from "../mover/mover.type";
import { moverService } from "../mover/mover.service";
import { callMoverAiGemini } from "./mover-ai.gemini";
import { inferFilterResetIntent } from "./mover-ai.intent";
import {
  buildClarifyRegionReply,
  matchClarifyRegionChoice,
  resolveRegionFromMessage,
} from "./mover-ai.region";
import { moverAiRepository } from "./mover-ai.repository";
import { moverAiSortSchema, type ClientActionDto, type PostMessageDto } from "./mover-ai.schema";
import type {
  CreateSessionResult,
  GetSessionResult,
  MoverAiAssistantPayload,
  MoverAiFavoriteResult,
  MoverAiFilters,
  MoverAiMessageView,
  MoverAiNextAction,
  MoverAiSlotAction,
  MoverAiSort,
  PostMessageResult,
} from "./mover-ai.type";
import { buildUi, resolveNextAction, resolveSlotAction, WELCOME_MESSAGE } from "./mover-ai.ui";

/** 메시지에서 분명한 이사 유형만 읽어 ServiceType으로 반환합니다 */
function inferExplicitService(message: string): ServiceType | null {
  const compact = message.replace(/\s/g, "");
  if (/사무실이사|오피스이사/.test(compact)) return "OFFICE";
  if (/가정이사/.test(compact)) return "HOME";
  if (/소형이사/.test(compact)) return "SMALL";
  return null;
}

/** 메시지에서 분명한 정렬 키워드만 읽어 MoverAiSort로 반환합니다 */
function inferExplicitSort(message: string): MoverAiSort | null {
  const compact = message.replace(/\s/g, "");
  if (/평점|별점/.test(compact)) return "rating";
  if (/리뷰|후기/.test(compact)) return "review";
  if (/경력/.test(compact)) return "career";
  if (/확정/.test(compact)) return "confirmed";
  return null;
}

const HISTORY_LIMIT = 12;
const MOVER_PAGE_SIZE = 3;
const EMPTY_FILTERS: MoverAiFilters = { region: null, service: null, sort: null };

const CHANGE_FILTERS_REPLY = "조건을 다시 설정해볼까요?\n이사 가실 지역과 이사 유형을 알려주세요☺️";
const GEMINI_FALLBACK_REPLY =
  "잠시 응답이 지연됐어요. 이사 가실 지역과 이사 유형을 다시 알려주시면 찾아드릴게요☺️";

/** 비어 있는 슬롯에 맞춰 다음 질문 문구를 만듭니다 */
function buildAskReply(
  slotAction: Exclude<MoverAiSlotAction, "SHOW_MOVERS">,
  filters: MoverAiFilters
): string {
  if (slotAction === "ASK_REGION") {
    if (filters.service) return "다음으로 이사 가실 지역을 알려주세요.";
    return "이사 가실 지역이 어디인가요?";
  }
  if (slotAction === "ASK_SERVICE") {
    if (filters.region) return "다음으로 이사 유형을 알려주세요.";
    return "어떤 이사를 준비하고 계신가요?";
  }
  return "어떤 기준으로 찾아볼까요?";
}

const FOUND_MOVERS_REPLY =
  "조건에 맞는 기사님을 찾아봤어요.\n카드를 클릭하면 기사님의 상세 정보를 확인할 수 있어요😀";
const SHOW_MORE_REPLY = "다른 기사님도 찾아봤어요.";

/** 더 볼 기사님이 없을 때 인원 수에 맞는 마지막 안내 문구를 만듭니다 */
function lastMoversLine(moverCount: number): string {
  return moverCount === 1
    ? "조건에 맞는 마지막 기사님이에요."
    : "조건에 맞는 마지막 기사님들이에요.";
}

/** 세션 DB 값을 대화에서 쓰는 필터 형태로 바꿉니다 */
function toFilters(session: {
  region: RegionType | null;
  service: ServiceType | null;
  sort: string | null;
}): MoverAiFilters {
  const sort = moverAiSortSchema.safeParse(session.sort);
  return {
    region: session.region,
    service: session.service,
    sort: sort.success ? sort.data : null,
  };
}

/** 어시스턴트 메시지 JSON을 payload 타입으로 꺼냅니다 */
function parsePayload(payload: Prisma.JsonValue | null): MoverAiAssistantPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as unknown as MoverAiAssistantPayload;
}

/** 로그인한 사용자의 세션만 조회하고, 없으면 404를 던집니다 */
async function loadOwnedSession(sessionId: string, userId: number) {
  const session = await moverAiRepository.findOwnedSession(sessionId, userId);
  if (!session) {
    throw AppError.notFound("AI 찾기 세션을 찾을 수 없습니다");
  }
  return session;
}

/** 세 칸이 모두 채워진 조건으로 기사님을 한 페이지 조회합니다 */
async function fetchMovers(filters: MoverAiFilters, cursor: string | null) {
  if (!filters.region || !filters.service || !filters.sort) {
    throw AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, "검색 조건이 아직 완성되지 않았습니다");
  }

  return moverService.listByFilters({
    region: filters.region,
    service: filters.service,
    sort: filters.sort,
    cursor: cursor ?? undefined,
    limit: MOVER_PAGE_SIZE,
  });
}

/** 조회된 기사 수와 다음 페이지 여부에 맞는 목록 안내 문구를 만듭니다 */
function buildShowMoversContent(moverCount: number, hasNext: boolean, baseReply?: string): string {
  if (moverCount === 0) {
    return "조건에 맞는 기사님을 찾지 못했어요.\n다른 조건으로 찾아볼까요?";
  }
  // 페이지당 최대 3명 — 1~2명이어도 그대로 노출하고, 다음 페이지가 없을 때만 안내 문구를 붙입니다
  const head = baseReply?.trim() || FOUND_MOVERS_REPLY;
  if (!hasNext) {
    return `${head}\n${lastMoversLine(moverCount)}`;
  }
  return head;
}

/** 새로 찜한 수와 이미 찜한 수에 맞는 찜 완료 문구를 만듭니다 */
function buildFavoriteAllContent(createdCount: number, skippedCount: number): string {
  if (createdCount === 0) {
    return "모두 이미 찜한 기사님이에요.";
  }
  if (skippedCount > 0) {
    return `${createdCount}명의 기사님을 찜했어요. 이미 찜한 기사님은 제외했어요.`;
  }
  return `${createdCount}명의 기사님을 찜했어요.`;
}

/** 어시스턴트 말을 저장하고 칩·카드 UI를 붙여 반환합니다 */
async function persistAssistant(params: {
  sessionId: string;
  content: string;
  filters: MoverAiFilters;
  nextAction: MoverAiNextAction;
  payload?: Omit<MoverAiAssistantPayload, "filters" | "nextAction">;
  movers?: MoverListItemResponse[] | null;
}): Promise<MoverAiMessageView> {
  const stored: MoverAiAssistantPayload = {
    filters: params.filters,
    nextAction: params.nextAction,
    ...params.payload,
  };

  const row = await moverAiRepository.createMessage({
    sessionId: params.sessionId,
    role: "ASSISTANT",
    content: params.content,
    payload: stored as unknown as Prisma.InputJsonValue,
  });

  return {
    id: row.id,
    role: "ASSISTANT",
    content: params.content,
    ui: buildUi({
      nextAction: params.nextAction,
      filters: params.filters,
      movers: params.movers ?? null,
      listMeta: params.payload?.listMeta ?? null,
      regionClarify: params.payload?.regionClarify ?? null,
    }),
  };
}

/** 기사 목록을 조회해 세션과 메시지에 저장한 뒤 보여줍니다 */
async function respondShowMovers(params: {
  sessionId: string;
  filters: MoverAiFilters;
  cursor: string | null;
  baseReply?: string;
}): Promise<MoverAiMessageView> {
  const list = await fetchMovers(params.filters, params.cursor);
  const content = buildShowMoversContent(list.data.length, list.hasNext, params.baseReply);

  await moverAiRepository.updateSessionSlots(params.sessionId, {
    ...params.filters,
    cursor: list.nextCursor,
  });

  return persistAssistant({
    sessionId: params.sessionId,
    content,
    filters: params.filters,
    nextAction: "SHOW_MOVERS",
    movers: list.data,
    payload: {
      moverIds: list.data.map((m) => m.id),
      listMeta: { nextCursor: list.nextCursor, hasNext: list.hasNext },
    },
  });
}

/** 지역·유형·정렬을 모두 비우고 조건 다시 설정을 안내합니다 */
async function respondChangeAllFilters(sessionId: string): Promise<PostMessageResult> {
  await moverAiRepository.updateSessionSlots(sessionId, { ...EMPTY_FILTERS, cursor: null });
  const assistantMessage = await persistAssistant({
    sessionId,
    content: CHANGE_FILTERS_REPLY,
    filters: EMPTY_FILTERS,
    nextAction: "ASK_REGION",
  });
  return { sessionId, assistantMessage, filters: EMPTY_FILTERS };
}

/** 지역 또는 유형 칸만 비우고 해당 값을 다시 묻습니다 */
async function respondPartialFilterReset(
  sessionId: string,
  filters: MoverAiFilters,
  intent: "REGION" | "SERVICE"
): Promise<PostMessageResult> {
  if (intent === "REGION") {
    const nextFilters: MoverAiFilters = { ...filters, region: null };
    await moverAiRepository.updateSessionSlots(sessionId, { ...nextFilters, cursor: null });
    const assistantMessage = await persistAssistant({
      sessionId,
      content: "알겠어요. 이사 가실 지역을 다시 알려주세요.",
      filters: nextFilters,
      nextAction: "ASK_REGION",
    });
    return { sessionId, assistantMessage, filters: nextFilters };
  }

  const nextFilters: MoverAiFilters = { ...filters, service: null };
  await moverAiRepository.updateSessionSlots(sessionId, { ...nextFilters, cursor: null });
  const assistantMessage = await persistAssistant({
    sessionId,
    content: "알겠어요. 이사 유형을 다시 알려주세요.",
    filters: nextFilters,
    nextAction: "ASK_SERVICE",
  });
  return { sessionId, assistantMessage, filters: nextFilters };
}

/** 필터 채움 상태에 따라 다음 칸을 묻거나 기사 목록을 보여줍니다 */
async function respondBySlots(
  sessionId: string,
  filters: MoverAiFilters
): Promise<PostMessageResult> {
  const slotAction = resolveSlotAction(filters);

  if (slotAction === "SHOW_MOVERS") {
    const assistantMessage = await respondShowMovers({
      sessionId,
      filters,
      cursor: null,
      baseReply: FOUND_MOVERS_REPLY,
    });
    return { sessionId, assistantMessage, filters };
  }

  await moverAiRepository.updateSessionSlots(sessionId, { ...filters, cursor: null });
  const assistantMessage = await persistAssistant({
    sessionId,
    content: buildAskReply(slotAction, filters),
    filters,
    nextAction: slotAction,
  });
  return { sessionId, assistantMessage, filters };
}

/** 저장된 커서로 다음 기사 페이지를 보여줍니다 */
async function handleShowMore(
  sessionId: string,
  filters: MoverAiFilters,
  cursor: string | null
): Promise<PostMessageResult> {
  if (resolveSlotAction(filters) !== "SHOW_MOVERS") {
    throw AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, "검색 조건이 아직 완성되지 않았습니다");
  }

  if (!cursor) {
    const assistantMessage = await persistAssistant({
      sessionId,
      content: lastMoversLine(0),
      filters,
      nextAction: "SHOW_MOVERS",
      movers: [],
      payload: {
        moverIds: [],
        listMeta: { nextCursor: null, hasNext: false },
      },
    });
    return { sessionId, assistantMessage, filters };
  }

  const assistantMessage = await respondShowMovers({
    sessionId,
    filters,
    cursor,
    baseReply: SHOW_MORE_REPLY,
  });
  return { sessionId, assistantMessage, filters };
}

/** 직전에 추천한 기사님을 한꺼번에 찜합니다 */
async function handleFavoriteAll(
  sessionId: string,
  userId: number,
  filters: MoverAiFilters
): Promise<PostMessageResult> {
  const latest = parsePayload(
    (await moverAiRepository.findLatestAssistant(sessionId))?.payload ?? null
  );
  const moverIds = latest?.moverIds ?? [];
  if (moverIds.length === 0) {
    throw AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, "찜할 추천 기사님이 없습니다");
  }

  const { createdCount, skippedCount } = await favoriteService.bulkCreate(userId, moverIds);
  const favoriteResult: MoverAiFavoriteResult = { favoritedCount: createdCount, skippedCount };

  // moverIds를 넣지 않음 — 복원 시 찜 완료 말에 기사 카드가 다시 붙지 않게
  const assistantMessage = await persistAssistant({
    sessionId,
    content: buildFavoriteAllContent(createdCount, skippedCount),
    filters,
    nextAction: "SHOW_MOVERS",
    payload: {
      favoriteResult,
      listMeta: latest?.listMeta ?? null,
    },
  });

  return { sessionId, assistantMessage, filters, favoriteResult };
}

/** 칩 종류에 따라 슬롯 갱신·더 보기·조건 초기화·찜을 처리합니다 */
async function handleClientAction(params: {
  sessionId: string;
  userId: number;
  filters: MoverAiFilters;
  cursor: string | null;
  action: ClientActionDto;
}): Promise<PostMessageResult> {
  const { sessionId, userId, filters, cursor, action } = params;

  switch (action.type) {
    case "SELECT_SERVICE":
      return respondBySlots(sessionId, { ...filters, service: action.value });
    case "SELECT_SORT":
      return respondBySlots(sessionId, { ...filters, sort: action.value });
    case "SELECT_REGION":
      return respondBySlots(sessionId, { ...filters, region: action.value });
    case "SHOW_MORE":
      return handleShowMore(sessionId, filters, cursor);
    case "CHANGE_FILTERS":
      return respondChangeAllFilters(sessionId);
    case "FAVORITE_ALL":
      return handleFavoriteAll(sessionId, userId, filters);
  }
}

export const moverAiService = {
  /** 빈 세션과 환영 메시지를 만들고 Gemini는 호출하지 않습니다 */
  async createSession(userId: number): Promise<CreateSessionResult> {
    const session = await moverAiRepository.createSession(userId);
    const welcomePayload: MoverAiAssistantPayload = {
      filters: EMPTY_FILTERS,
      nextAction: "ASK_REGION",
    };
    const welcome = await moverAiRepository.createMessage({
      sessionId: session.id,
      role: "ASSISTANT",
      content: WELCOME_MESSAGE,
      payload: welcomePayload as unknown as Prisma.InputJsonValue,
    });

    return {
      sessionId: session.id,
      messages: [
        {
          id: welcome.id,
          role: "ASSISTANT",
          content: WELCOME_MESSAGE,
          ui: buildUi({ nextAction: "ASK_REGION" }),
        },
      ],
    };
  },

  /** 저장된 대화·칩·기사 카드를 복원해 반환합니다 */
  async getSession(userId: number, sessionId: string): Promise<GetSessionResult> {
    const session = await moverAiRepository.findOwnedSessionWithMessages(sessionId, userId);
    if (!session) {
      throw AppError.notFound("AI 찾기 세션을 찾을 수 없습니다");
    }

    // payload에 저장된 moverIds를 모아 한 번에 조회 — 모달 재오픈 시 캐러셀이 유지되도록
    const payloads = session.messages.map((m) =>
      m.role === "ASSISTANT" ? parsePayload(m.payload) : null
    );
    const allMoverIds = [...new Set(payloads.flatMap((payload) => payload?.moverIds ?? []))];
    const moversById = new Map(
      (allMoverIds.length > 0 ? await moverService.listByIds(allMoverIds) : []).map((mover) => [
        mover.id,
        mover,
      ])
    );

    const messages: MoverAiMessageView[] = session.messages.map((m, index) => {
      if (m.role !== "ASSISTANT") {
        return { id: m.id, role: m.role as "USER" | "SYSTEM", content: m.content };
      }
      const payload = payloads[index];
      // 찜 완료 메시지는 카드 없이 문구만 — 추천 목록과 구분
      const movers = payload?.favoriteResult
        ? null
        : (payload?.moverIds
            ?.map((id) => moversById.get(id))
            .filter((mover): mover is MoverListItemResponse => mover != null) ?? null);

      return {
        id: m.id,
        role: "ASSISTANT",
        content: m.content,
        ui: buildUi({
          nextAction: payload?.nextAction ?? "ASK_REGION",
          filters: payload?.filters ?? null,
          movers: movers && movers.length > 0 ? movers : null,
          listMeta: payload?.favoriteResult ? null : (payload?.listMeta ?? null),
          regionClarify: payload?.regionClarify ?? null,
        }),
      };
    });

    return { sessionId: session.id, filters: toFilters(session), messages };
  },

  /** 칩 또는 말에서 조건을 해석해 다음 안내나 기사 목록을 반환합니다 */
  async postMessage(
    userId: number,
    sessionId: string,
    dto: PostMessageDto
  ): Promise<PostMessageResult> {
    const session = await loadOwnedSession(sessionId, userId);
    const filters = toFilters(session);

    // 이번 유저 메시지는 프롬프트에 따로 넣으므로, 저장 전에 이력을 읽어 중복을 막습니다
    const history = dto.clientAction
      ? []
      : await moverAiRepository.findRecentMessages(sessionId, HISTORY_LIMIT);

    await moverAiRepository.createMessage({
      sessionId,
      role: "USER",
      content: dto.message,
    });

    if (dto.clientAction) {
      return handleClientAction({
        sessionId,
        userId,
        filters,
        cursor: session.cursor,
        action: dto.clientAction,
      });
    }

    const regionResult = resolveRegionFromMessage(dto.message);
    const explicitService = inferExplicitService(dto.message);
    const explicitSort = inferExplicitSort(dto.message);
    const resetIntent = inferFilterResetIntent(dto.message);

    // CLARIFY_REGION 직후 — 칩 대신 말로 고른 경우 후보와 매칭
    const latestAssistant = parsePayload(
      (await moverAiRepository.findLatestAssistant(sessionId))?.payload ?? null
    );
    if (latestAssistant?.nextAction === "CLARIFY_REGION" && latestAssistant.regionClarify) {
      const chosen = matchClarifyRegionChoice(dto.message, latestAssistant.regionClarify);
      if (chosen) {
        return respondBySlots(sessionId, {
          region: chosen,
          service: explicitService ?? filters.service,
          sort: explicitSort ?? filters.sort,
        });
      }
    }

    if (regionResult.type === "ambiguous") {
      // 유형·정렬은 유지
      const nextFilters: MoverAiFilters = {
        region: null,
        service: explicitService ?? filters.service,
        sort: explicitSort ?? filters.sort,
      };
      await moverAiRepository.updateSessionSlots(sessionId, {
        ...nextFilters,
        cursor: null,
      });
      const assistantMessage = await persistAssistant({
        sessionId,
        content: buildClarifyRegionReply(regionResult.clarify),
        filters: nextFilters,
        nextAction: "CLARIFY_REGION",
        payload: { regionClarify: regionResult.clarify },
      });
      return { sessionId, assistantMessage, filters: nextFilters };
    }

    // 해당 슬롯을 비운 뒤 같은 문장의 새 값을 적용
    if (resetIntent) {
      let nextFilters: MoverAiFilters =
        resetIntent === "ALL"
          ? { ...EMPTY_FILTERS }
          : resetIntent === "REGION"
            ? { ...filters, region: null }
            : { ...filters, service: null };

      if (regionResult.type === "resolved")
        nextFilters = { ...nextFilters, region: regionResult.region };
      if (explicitService) nextFilters = { ...nextFilters, service: explicitService };
      if (explicitSort) nextFilters = { ...nextFilters, sort: explicitSort };

      const hasNewValue =
        regionResult.type === "resolved" || explicitService != null || explicitSort != null;
      if (!hasNewValue) {
        if (resetIntent === "ALL") return respondChangeAllFilters(sessionId);
        return respondPartialFilterReset(sessionId, filters, resetIntent);
      }
      return respondBySlots(sessionId, nextFilters);
    }

    // 지명·유형·정렬이 명확하면 Gemini 없이 BE 고정 흐름
    if (regionResult.type === "resolved" || explicitService || explicitSort) {
      const nextFilters: MoverAiFilters = {
        region: regionResult.type === "resolved" ? regionResult.region : filters.region,
        service: explicitService ?? filters.service,
        sort: explicitSort ?? filters.sort,
      };
      return respondBySlots(sessionId, nextFilters);
    }

    let gemini;
    try {
      gemini = await callMoverAiGemini({
        currentFilters: filters,
        history: history.map((m) => ({ role: m.role, content: m.content })),
        userMessage: dto.message,
      });
    } catch {
      // Gemini 실패해도 사용자 메시지 뒤에 고정 안내를 남겨 대화가 끊기지 않게
      const slotAction = resolveSlotAction(filters);
      const content =
        slotAction === "SHOW_MOVERS"
          ? GEMINI_FALLBACK_REPLY
          : `${GEMINI_FALLBACK_REPLY}\n${buildAskReply(slotAction, filters)}`;
      const nextAction = slotAction === "SHOW_MOVERS" ? "ASK_REGION" : slotAction;
      await moverAiRepository.updateSessionSlots(sessionId, {
        ...filters,
        cursor: null,
      });
      const assistantMessage = await persistAssistant({
        sessionId,
        content,
        filters,
        nextAction,
      });
      return { sessionId, assistantMessage, filters };
    }

    const nextFilters: MoverAiFilters = {
      region:
        gemini.nextAction === "CLARIFY_REGION" ? null : (gemini.filters.region ?? filters.region),
      service: gemini.filters.service ?? filters.service,
      sort: gemini.filters.sort ?? filters.sort,
    };

    // Gemini CLARIFY_REGION → 칩 없이 도착지 재질문 (region 비움)
    const nextAction =
      gemini.nextAction === "CLARIFY_REGION"
        ? "ASK_REGION"
        : resolveNextAction(nextFilters, gemini.nextAction);

    if (nextAction === "SHOW_MOVERS") {
      const assistantMessage = await respondShowMovers({
        sessionId,
        filters: nextFilters,
        cursor: null,
        baseReply: FOUND_MOVERS_REPLY,
      });
      return { sessionId, assistantMessage, filters: nextFilters };
    }

    const filtersChanged =
      nextFilters.region !== filters.region ||
      nextFilters.service !== filters.service ||
      nextFilters.sort !== filters.sort;
    await moverAiRepository.updateSessionSlots(sessionId, {
      ...nextFilters,
      cursor: filtersChanged ? null : session.cursor,
    });

    const slotAsk =
      nextAction === "ASK_REGION" || nextAction === "ASK_SERVICE" || nextAction === "ASK_SORT"
        ? buildAskReply(nextAction, nextFilters)
        : null;
    const content =
      nextAction === "CLARIFY_UNSUPPORTED"
        ? gemini.reply
        : gemini.nextAction === "CLARIFY_REGION"
          ? gemini.reply
          : (slotAsk ?? gemini.reply);

    const assistantMessage = await persistAssistant({
      sessionId,
      content,
      filters: nextFilters,
      nextAction,
    });

    return { sessionId, assistantMessage, filters: nextFilters };
  },
};
