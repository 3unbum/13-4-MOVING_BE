import { callMoverAiGemini } from "./mover-ai.gemini";
import { moverAiRepository } from "./mover-ai.repository";
import { moverAiService } from "./mover-ai.service";
import { favoriteService } from "../favorite/favorite.service";
import { moverService } from "../mover/mover.service";

jest.mock("./mover-ai.repository", () => ({
  moverAiRepository: {
    createSession: jest.fn(),
    createMessage: jest.fn(),
    findOwnedSession: jest.fn(),
    findOwnedSessionWithMessages: jest.fn(),
    findRecentMessages: jest.fn(),
    findLatestAssistant: jest.fn(),
    findRecentAssistants: jest.fn(),
    updateSessionSlots: jest.fn(),
  },
}));

jest.mock("./mover-ai.gemini", () => ({
  callMoverAiGemini: jest.fn(),
}));

jest.mock("../mover/mover.service", () => ({
  moverService: {
    listByFilters: jest.fn(),
    listByIds: jest.fn(),
  },
}));

jest.mock("../favorite/favorite.service", () => ({
  favoriteService: {
    bulkCreate: jest.fn(),
  },
}));

const repository = jest.mocked(moverAiRepository);
const gemini = jest.mocked(callMoverAiGemini);
const movers = jest.mocked(moverService);
const favorites = jest.mocked(favoriteService);

function ownedSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    userId: 1,
    region: null,
    service: null,
    sort: null,
    cursor: null,
    ...overrides,
  };
}

describe("moverAiService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (repository.createMessage as unknown as jest.Mock).mockResolvedValue({ id: "msg-1" });
    repository.updateSessionSlots.mockResolvedValue({} as never);
    repository.findRecentMessages.mockResolvedValue([]);
    repository.findLatestAssistant.mockResolvedValue(null);
    repository.findRecentAssistants.mockResolvedValue([]);
    repository.findOwnedSession.mockResolvedValue(ownedSession() as never);
  });

  it("세션을 만들 때 Gemini를 부르지 않고 지역 질문만 남긴다", async () => {
    repository.createSession.mockResolvedValue({ id: "sess-1" } as never);

    const result = await moverAiService.createSession(1);

    expect(gemini).not.toHaveBeenCalled();
    expect(result.sessionId).toBe("sess-1");
    expect(result.messages[0]?.ui?.chips).toBeNull();
    expect(result.messages[0]?.ui?.nextAction).toBe("ASK_REGION");
    expect(result.messages[0]?.content).toContain("이사 가실 지역");
  });

  it("칩으로 유형만 고르면 지역을 이어서 묻는다", async () => {
    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "소형이사",
      clientAction: { type: "SELECT_SERVICE", value: "SMALL" },
    });

    expect(gemini).not.toHaveBeenCalled();
    expect(repository.updateSessionSlots).toHaveBeenCalledWith("sess-1", {
      region: null,
      service: "SMALL",
      sort: null,
      cursor: null,
    });
    expect(result.assistantMessage.content).toBe("다음으로 이사 가실 지역을 알려주세요.");
    expect(result.assistantMessage.ui?.chips).toBeNull();
  });

  it("겹치는 지명은 확정하지 않고 이미 말한 유형은 유지한다", async () => {
    repository.findOwnedSession.mockResolvedValue(ownedSession({ service: "HOME" }) as never);

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "죽전으로 이사",
      clientAction: null,
    });

    expect(gemini).not.toHaveBeenCalled();
    expect(result.filters).toEqual({ region: null, service: "HOME", sort: null });
    expect(result.assistantMessage.ui?.nextAction).toBe("CLARIFY_REGION");
    expect(result.assistantMessage.ui?.chips?.length).toBeGreaterThan(0);
    expect(result.assistantMessage.content).toContain("죽전");
  });

  it("지역·유형·정렬이 분명하면 기사 목록을 보여준다", async () => {
    movers.listByFilters.mockResolvedValue({
      data: [{ id: 7 }] as never,
      nextCursor: "cursor-1",
      hasNext: true,
    });

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "용인으로 가정이사 평점 높은 순",
      clientAction: null,
    });

    expect(gemini).not.toHaveBeenCalled();
    expect(movers.listByFilters).toHaveBeenCalledWith({
      region: "GYEONGGI",
      service: "HOME",
      sort: "rating",
      cursor: undefined,
      limit: 3,
    });
    expect(result.assistantMessage.content).toContain("조건에 맞는 기사님을 찾아봤어요.");
    expect(result.assistantMessage.content).toContain("카드를 클릭하면");
    expect(result.assistantMessage.ui?.movers).toEqual([{ id: 7 }]);
    expect(result.assistantMessage.ui?.listMeta).toEqual({
      nextCursor: "cursor-1",
      hasNext: true,
    });
  });

  it("지역만 바꾸겠다고 하면 그 칸만 비운다", async () => {
    repository.findOwnedSession.mockResolvedValue(
      ownedSession({ region: "SEOUL", service: "HOME", sort: "rating" }) as never
    );

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "지역 바꿀게",
      clientAction: null,
    });

    expect(result.filters).toEqual({ region: null, service: "HOME", sort: "rating" });
    expect(result.assistantMessage.content).toBe("알겠어요. 이사 가실 지역을 다시 알려주세요.");
    expect(result.assistantMessage.ui?.nextAction).toBe("ASK_REGION");
  });

  it("규칙을 못 읽고 Gemini가 실패하면 고정 안내를 남긴다", async () => {
    gemini.mockRejectedValue(new Error("503"));

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "견적 가격이 얼마예요",
      clientAction: null,
    });

    expect(result.assistantMessage.content).toContain("잠시 응답이 지연됐어요.");
    expect(result.assistantMessage.content).toContain("이사 가실 지역이 어디인가요?");
    expect(result.filters).toEqual({ region: null, service: null, sort: null });
  });

  it("모두 찜하기는 직전 추천 id만 찜하고 카드는 다시 붙이지 않는다", async () => {
    repository.findRecentAssistants.mockResolvedValue([
      { payload: { nextAction: "CLARIFY_UNSUPPORTED" } },
      {
        payload: {
          moverIds: [3, 4],
          listMeta: { nextCursor: null, hasNext: false },
        },
      },
    ] as never);
    favorites.bulkCreate.mockResolvedValue({ createdCount: 1, skippedCount: 1 });

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "모두 찜",
      clientAction: { type: "FAVORITE_ALL", value: null },
    });

    expect(favorites.bulkCreate).toHaveBeenCalledWith(1, [3, 4]);
    expect(result.assistantMessage.content).toBe(
      "1명의 기사님을 찜했어요. 이미 찜한 기사님은 제외했어요."
    );
    expect(result.assistantMessage.ui?.movers).toBeNull();
    const assistantCall = repository.createMessage.mock.calls.find(
      ([data]) => data.role === "ASSISTANT"
    );
    expect(assistantCall?.[0].payload).not.toHaveProperty("moverIds");
  });

  it("세션을 다시 열면 찜 완료 말에는 기사 카드를 붙이지 않는다", async () => {
    repository.findOwnedSessionWithMessages.mockResolvedValue({
      ...ownedSession({ region: "SEOUL", service: "HOME", sort: "rating" }),
      messages: [
        {
          id: "a1",
          role: "ASSISTANT",
          content: "찾았어요",
          payload: {
            filters: { region: "SEOUL", service: "HOME", sort: "rating" },
            nextAction: "SHOW_MOVERS",
            moverIds: [7],
            listMeta: { nextCursor: null, hasNext: false },
          },
        },
        {
          id: "a2",
          role: "ASSISTANT",
          content: "찜했어요",
          payload: {
            filters: { region: "SEOUL", service: "HOME", sort: "rating" },
            nextAction: "SHOW_MOVERS",
            favoriteResult: { favoritedCount: 1, skippedCount: 0 },
            moverIds: [7],
          },
        },
      ],
    } as never);
    movers.listByIds.mockResolvedValue([{ id: 7 }] as never);

    const result = await moverAiService.getSession(1, "sess-1");

    expect(movers.listByIds).toHaveBeenCalledWith([7]);
    expect(result.messages[0]?.ui?.movers).toEqual([{ id: 7 }]);
    expect(result.messages[1]?.ui?.movers).toBeNull();
  });
});
