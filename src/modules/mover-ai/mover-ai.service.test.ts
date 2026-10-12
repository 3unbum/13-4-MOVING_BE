import { callMoverAiGemini, summarizeReviewComments } from "./mover-ai.gemini";
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
    findConfirmedReviewComments: jest.fn(),
    updateSessionSlots: jest.fn(),
  },
}));

jest.mock("./mover-ai.gemini", () => ({
  callMoverAiGemini: jest.fn(),
  summarizeReviewComments: jest.fn(),
}));

jest.mock("../mover/mover.service", () => ({
  moverService: {
    listByFilters: jest.fn(),
    listByIds: jest.fn(),
    listRankCandidates: jest.fn(),
  },
}));

jest.mock("../favorite/favorite.service", () => ({
  favoriteService: {
    bulkCreate: jest.fn(),
  },
}));

const repository = jest.mocked(moverAiRepository);
const gemini = jest.mocked(callMoverAiGemini);
const summarize = jest.mocked(summarizeReviewComments);
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
    repository.findConfirmedReviewComments.mockResolvedValue([]);
    movers.listRankCandidates.mockResolvedValue([]);
    summarize.mockResolvedValue(null);
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

  it("조건을 묻는 중 슬롯이 안 바뀌면 거절 문장을 먼저 붙인다", async () => {
    gemini.mockResolvedValue({
      reply: "이사 가실 지역을 알려주세요.",
      filters: { region: null, service: null, sort: null },
      nextAction: "ASK_REGION",
    });

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "놀러가고 싶어",
      clientAction: null,
    });

    expect(result.assistantMessage.content).toBe(
      "해당 질문엔 응답이 불가능해요😂\n이사 가실 지역이 어디인가요?"
    );
    expect(result.assistantMessage.ui?.nextAction).toBe("CLARIFY_UNSUPPORTED");
    expect(result.filters).toEqual({ region: null, service: null, sort: null });
  });

  it("정렬을 고르는 중 가격 질문에는 정렬 칩을 유지한다", async () => {
    repository.findOwnedSession.mockResolvedValue(
      ownedSession({ region: "SEOUL", service: "HOME" }) as never
    );
    repository.findLatestAssistant.mockResolvedValue({
      payload: {
        listMode: "browse",
        filters: { region: "SEOUL", service: "HOME", sort: null },
        nextAction: "ASK_SORT",
      },
    } as never);
    gemini.mockResolvedValue({
      reply: "가격 조건으로는 아직 찾아드릴 수 없어요.",
      filters: { region: "SEOUL", service: "HOME", sort: null },
      nextAction: "CLARIFY_UNSUPPORTED",
    });

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "제일 싼 기사님",
      clientAction: null,
    });

    expect(result.assistantMessage.content).toBe(
      "해당 질문엔 응답이 불가능해요😂\n어떤 기준으로 찾아볼까요?"
    );
    expect(result.assistantMessage.ui?.nextAction).toBe("CLARIFY_UNSUPPORTED");
    expect(result.assistantMessage.ui?.chips?.map((chip) => chip.label)).toEqual([
      "평점 높은 순",
      "리뷰 많은 순",
      "경력 많은 순",
      "확정 많은 순",
    ]);
    expect(movers.listRankCandidates).not.toHaveBeenCalled();
  });

  it("목록을 보는 중 조건을 유지한 말은 거절 없이 다시 보여준다", async () => {
    repository.findOwnedSession.mockResolvedValue(
      ownedSession({ region: "SEOUL", service: "HOME", sort: "rating" }) as never
    );
    repository.findLatestAssistant.mockResolvedValue({
      payload: {
        listMode: "browse",
        filters: { region: "SEOUL", service: "HOME", sort: "rating" },
        nextAction: "SHOW_MOVERS",
      },
    } as never);
    gemini.mockResolvedValue({
      reply: "같은 조건으로 다시 찾아볼게요.",
      filters: { region: "SEOUL", service: "HOME", sort: "rating" },
      nextAction: "SHOW_MOVERS",
    });
    movers.listByFilters.mockResolvedValue({
      data: [{ id: 4, nickName: "높음" }],
      nextCursor: null,
      hasNext: false,
    } as never);

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "다시 보여줘",
      clientAction: null,
    });

    expect(result.assistantMessage.content).not.toContain("해당 질문엔 응답이 불가능해요");
    expect(result.assistantMessage.ui?.nextAction).toBe("SHOW_MOVERS");
    expect(result.assistantMessage.ui?.movers).toEqual([{ id: 4, nickName: "높음" }]);
    expect(result.assistantMessage.ui?.chips?.map((chip) => chip.label)).toEqual([
      "기사님 한 명 추천받기",
      "기사님들 모두 찜하기",
      "조건 바꾸기",
    ]);
  });

  it("목록을 보는 중 무관한 말은 거절 뒤에 같은 목록을 유지한다", async () => {
    repository.findOwnedSession.mockResolvedValue(
      ownedSession({ region: "SEOUL", service: "HOME", sort: "rating" }) as never
    );
    repository.findLatestAssistant.mockResolvedValue({
      payload: {
        listMode: "browse",
        filters: { region: "SEOUL", service: "HOME", sort: "rating" },
        nextAction: "SHOW_MOVERS",
      },
    } as never);
    gemini.mockResolvedValue({
      reply: "가격은 찾아드릴 수 없어요.",
      filters: { region: "SEOUL", service: "HOME", sort: "rating" },
      nextAction: "CLARIFY_UNSUPPORTED",
    });
    movers.listByFilters.mockResolvedValue({
      data: [{ id: 4, nickName: "높음" }],
      nextCursor: "next",
      hasNext: true,
    } as never);

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "제일 싼 기사님",
      clientAction: null,
    });

    expect(result.assistantMessage.content.startsWith("해당 질문엔 응답이 불가능해요😂")).toBe(
      true
    );
    expect(result.assistantMessage.ui?.nextAction).toBe("SHOW_MOVERS");
    expect(result.assistantMessage.ui?.movers).toEqual([{ id: 4, nickName: "높음" }]);
    expect(result.assistantMessage.ui?.chips?.map((chip) => chip.label)).toContain(
      "다른 기사님 더 보기"
    );
    expect(result.assistantMessage.ui?.chips?.map((chip) => chip.label)).toContain("조건 바꾸기");
  });

  it("추천을 보는 중 무관한 말은 거절 뒤에 같은 추천을 유지한다", async () => {
    repository.findOwnedSession.mockResolvedValue(
      ownedSession({ region: "SEOUL", service: "HOME" }) as never
    );
    repository.findLatestAssistant.mockResolvedValue({
      payload: {
        listMode: "recommend",
        filters: { region: "SEOUL", service: "HOME", sort: null },
        nextAction: "SHOW_RECOMMENDATION",
        candidateCount: 2,
        recommendation: { moverId: 4, onlyOne: false, reason: "", reviewSummary: null },
      },
    } as never);
    gemini.mockResolvedValue({
      reply: "일정은 찾아드릴 수 없어요.",
      filters: { region: "SEOUL", service: "HOME", sort: null },
      nextAction: "CLARIFY_UNSUPPORTED",
    });
    movers.listRankCandidates.mockResolvedValue([
      {
        userId: 4,
        nickName: "높음",
        avgRating: 4.8,
        reviewCount: 40,
        career: 12,
        confirmedCount: 30,
      },
      { userId: 3, nickName: "낮음", avgRating: 4, reviewCount: 2, career: 1, confirmedCount: 1 },
    ]);
    movers.listByIds.mockResolvedValue([{ id: 4, nickName: "높음" }] as never);

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "놀러가고 싶어",
      clientAction: null,
    });

    expect(result.assistantMessage.content.startsWith("해당 질문엔 응답이 불가능해요😂")).toBe(
      true
    );
    expect(result.assistantMessage.content).toContain("**높음** 기사님을 추천해요");
    expect(result.assistantMessage.ui?.nextAction).toBe("SHOW_RECOMMENDATION");
    expect(result.assistantMessage.ui?.chips?.map((chip) => chip.label)).toEqual([
      "목록에서 직접 고르기",
      "이 기사님 찜하기",
      "조건 바꾸기",
    ]);
  });

  it("무관한 말에는 저장해 둔 추천 기사님을 유지하고, 후보에서 빠지면 새 1등을 고른다", async () => {
    repository.findOwnedSession.mockResolvedValue(
      ownedSession({ region: "SEOUL", service: "HOME" }) as never
    );
    const candidates = [
      {
        userId: 4,
        nickName: "높음",
        avgRating: 4.8,
        reviewCount: 40,
        career: 12,
        confirmedCount: 30,
      },
      { userId: 3, nickName: "낮음", avgRating: 4, reviewCount: 2, career: 1, confirmedCount: 1 },
    ];
    movers.listRankCandidates.mockResolvedValue(candidates);
    movers.listByIds.mockImplementation(async (ids: number[]) =>
      ids.map((id) => ({ id, nickName: id === 3 ? "낮음" : "높음" }) as never)
    );
    gemini.mockResolvedValue({
      reply: "일정은 찾아드릴 수 없어요.",
      filters: { region: "SEOUL", service: "HOME", sort: null },
      nextAction: "CLARIFY_UNSUPPORTED",
    });

    repository.findLatestAssistant.mockResolvedValue({
      payload: {
        listMode: "recommend",
        filters: { region: "SEOUL", service: "HOME", sort: null },
        nextAction: "SHOW_RECOMMENDATION",
        candidateCount: 2,
        recommendation: { moverId: 3, onlyOne: false, reason: "", reviewSummary: null },
      },
    } as never);

    const kept = await moverAiService.postMessage(1, "sess-1", {
      message: "놀러가고 싶어",
      clientAction: null,
    });

    expect(kept.assistantMessage.ui?.movers).toEqual([{ id: 3, nickName: "낮음" }]);

    repository.findLatestAssistant.mockResolvedValue({
      payload: {
        listMode: "recommend",
        filters: { region: "SEOUL", service: "HOME", sort: null },
        nextAction: "SHOW_RECOMMENDATION",
        candidateCount: 2,
        recommendation: { moverId: 99, onlyOne: false, reason: "", reviewSummary: null },
      },
    } as never);

    const replaced = await moverAiService.postMessage(1, "sess-1", {
      message: "놀러가고 싶어",
      clientAction: null,
    });

    expect(replaced.assistantMessage.ui?.movers).toEqual([{ id: 4, nickName: "높음" }]);
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

  it("한 명 추천을 이미 찜했으면 모두라는 말을 쓰지 않는다", async () => {
    repository.findRecentAssistants.mockResolvedValue([
      { payload: { moverIds: [9], nextAction: "SHOW_RECOMMENDATION" } },
    ] as never);
    favorites.bulkCreate.mockResolvedValue({ createdCount: 0, skippedCount: 1 });

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "이 기사님 찜하기",
      clientAction: { type: "FAVORITE_ALL", value: null },
    });

    expect(result.assistantMessage.content).toBe("이미 찜한 기사님이에요.");
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

  it("지역과 유형만 있으면 목록과 추천 중 고르게 한다", async () => {
    movers.listRankCandidates.mockResolvedValue([
      { userId: 1, nickName: "가", avgRating: 4, reviewCount: 3, career: 2, confirmedCount: 1 },
      { userId: 2, nickName: "나", avgRating: 5, reviewCount: 8, career: 6, confirmedCount: 4 },
    ]);

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "서울 가정이사",
      clientAction: null,
    });

    expect(result.assistantMessage.ui?.nextAction).toBe("ASK_MODE");
    expect(result.assistantMessage.ui?.chips?.map((chip) => chip.label)).toEqual([
      "기사님 한 명 추천받기",
      "목록에서 직접 고르기",
    ]);
    expect(gemini).not.toHaveBeenCalled();
  });

  it("지역과 유형이 있으면 추천·목록을 말로 고를 수 있다", async () => {
    repository.findOwnedSession.mockResolvedValue(
      ownedSession({ region: "SEOUL", service: "HOME" }) as never
    );
    movers.listRankCandidates.mockResolvedValue([
      { userId: 3, nickName: "낮음", avgRating: 5, reviewCount: 1, career: 1, confirmedCount: 1 },
      {
        userId: 4,
        nickName: "높음",
        avgRating: 4.8,
        reviewCount: 40,
        career: 12,
        confirmedCount: 30,
      },
    ]);
    movers.listByIds.mockResolvedValue([{ id: 4, nickName: "높음" }] as never);

    const recommended = await moverAiService.postMessage(1, "sess-1", {
      message: "추천해줘",
      clientAction: null,
    });

    expect(recommended.assistantMessage.ui?.nextAction).toBe("SHOW_RECOMMENDATION");
    expect(recommended.assistantMessage.ui?.movers).toEqual([{ id: 4, nickName: "높음" }]);
    expect(gemini).not.toHaveBeenCalled();

    const browsed = await moverAiService.postMessage(1, "sess-1", {
      message: "목록으로 볼게요",
      clientAction: null,
    });

    expect(browsed.assistantMessage.ui?.nextAction).toBe("ASK_SORT");
    expect(gemini).not.toHaveBeenCalled();
  });

  it("조건에 맞는 기사님이 한 명이면 선택 없이 리뷰 요약과 함께 보여준다", async () => {
    movers.listRankCandidates.mockResolvedValue([
      { userId: 9, nickName: "혼자", avgRating: 4.2, reviewCount: 2, career: 3, confirmedCount: 1 },
    ]);
    movers.listByIds.mockResolvedValue([{ id: 9, nickName: "혼자" }] as never);
    repository.findConfirmedReviewComments.mockResolvedValue([{ comment: "친절했어요" }]);
    summarize.mockResolvedValue("친절했다는 후기가 있어요.");

    const result = await moverAiService.postMessage(1, "sess-1", {
      message: "서울 가정이사",
      clientAction: null,
    });

    expect(result.assistantMessage.ui?.nextAction).toBe("SHOW_RECOMMENDATION");
    expect(result.assistantMessage.content).toContain("**혼자** 기사님");
    expect(result.assistantMessage.content).toContain("비교할 다른 기사님이 없어요");
    expect(result.assistantMessage.content).toContain(
      "**평점 4.2 (리뷰 2개), 경력 3년, 확정 1건**"
    );
    expect(result.assistantMessage.content).toContain("친절했다는 후기가 있어요.");
    expect(
      result.assistantMessage.ui?.chips?.some(
        (chip) => chip.action === "SELECT_MODE" && chip.value === "browse"
      )
    ).toBe(false);
  });

  it("추천을 고르면 점수 1등과 리뷰 요약을 보여주고, 비교 칩은 정렬로 이어진다", async () => {
    repository.findOwnedSession.mockResolvedValue(
      ownedSession({ region: "SEOUL", service: "HOME" }) as never
    );
    movers.listRankCandidates.mockResolvedValue([
      { userId: 3, nickName: "낮음", avgRating: 5, reviewCount: 1, career: 1, confirmedCount: 1 },
      {
        userId: 4,
        nickName: "높음",
        avgRating: 4.8,
        reviewCount: 40,
        career: 12,
        confirmedCount: 30,
      },
    ]);
    movers.listByIds.mockResolvedValue([{ id: 4, nickName: "높음" }] as never);
    summarize.mockResolvedValue("시간을 잘 지킨다는 평이 많아요.");

    const recommended = await moverAiService.postMessage(1, "sess-1", {
      message: "기사님 한 명 추천받기",
      clientAction: { type: "SELECT_MODE", value: "recommend" },
    });

    expect(recommended.assistantMessage.ui?.movers).toEqual([{ id: 4, nickName: "높음" }]);
    expect(recommended.assistantMessage.content).toContain("**높음** 기사님을 추천해요");
    expect(recommended.assistantMessage.content).toContain("같은 비중으로 맞춰 골랐어요");
    expect(recommended.assistantMessage.content).toContain(
      "**평점 4.8 (리뷰 40개), 경력 12년, 확정 30건**"
    );
    expect(recommended.assistantMessage.content).toContain("시간을 잘 지킨다는 평이 많아요.");
    expect(
      recommended.assistantMessage.ui?.chips?.some(
        (chip) => chip.action === "SELECT_MODE" && chip.value === "browse"
      )
    ).toBe(true);

    repository.findLatestAssistant.mockResolvedValue({
      payload: { listMode: "recommend", filters: { region: "SEOUL", service: "HOME", sort: null } },
    } as never);

    const compared = await moverAiService.postMessage(1, "sess-1", {
      message: "목록에서 직접 고르기",
      clientAction: { type: "SELECT_MODE", value: "browse" },
    });

    expect(compared.assistantMessage.ui?.nextAction).toBe("ASK_SORT");

    repository.findOwnedSession.mockResolvedValue(
      ownedSession({ region: "SEOUL", service: "HOME", sort: "rating" }) as never
    );
    movers.listByFilters.mockResolvedValue({
      data: [{ id: 4, nickName: "높음" }],
      nextCursor: null,
      hasNext: false,
    } as never);

    const listed = await moverAiService.postMessage(1, "sess-1", {
      message: "평점 높은 순",
      clientAction: { type: "SELECT_SORT", value: "rating" },
    });

    expect(listed.assistantMessage.ui?.nextAction).toBe("SHOW_MOVERS");
    expect(listed.assistantMessage.ui?.chips?.[0]?.label).toBe("기사님 한 명 추천받기");

    const recommendedAgain = await moverAiService.postMessage(1, "sess-1", {
      message: "기사님 한 명 추천받기",
      clientAction: { type: "SELECT_MODE", value: "recommend" },
    });

    expect(recommendedAgain.assistantMessage.ui?.nextAction).toBe("SHOW_RECOMMENDATION");
    expect(gemini).not.toHaveBeenCalled();
  });
});
