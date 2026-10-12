import { inferFilterResetIntent } from "./mover-ai.intent";
import { resolveNextAction, buildUi } from "./mover-ai.ui";
import {
  buildClarifyRegionReply,
  inferExplicitRegion,
  matchClarifyRegionChoice,
  resolveRegionFromMessage,
} from "./mover-ai.region";
import { geminiMoverAiResultSchema, postMessageSchema } from "./mover-ai.schema";

describe("inferFilterResetIntent", () => {
  it("조건·지역·유형 변경 의도를 감지한다", () => {
    expect(inferFilterResetIntent("조건 바꿀게")).toBe("ALL");
    expect(inferFilterResetIntent("아니 지역 바꿀게")).toBe("REGION");
    expect(inferFilterResetIntent("이사 유형 바꿀래")).toBe("SERVICE");
  });

  it("일반 지명 발화는 reset으로 보지 않는다", () => {
    expect(inferFilterResetIntent("죽전으로 이사")).toBeNull();
    expect(inferFilterResetIntent("아니요 지역은 서울이에요")).toBeNull();
  });
});

describe("resolveRegionFromMessage", () => {
  it("용인·수원 등 유일 시·군은 GYEONGGI로 매핑한다", () => {
    expect(inferExplicitRegion("용인으로 이사가고 싶다")).toBe("GYEONGGI");
    expect(inferExplicitRegion("수원 가정이사")).toBe("GYEONGGI");
  });

  it("도착지(~으로/~로)를 출발지보다 우선한다", () => {
    expect(inferExplicitRegion("서울에서 용인으로 이사해요")).toBe("GYEONGGI");
    expect(inferExplicitRegion("서울에서 대구로 이사해요")).toBe("DAEGU");
  });

  it("말고·아니고 앞 지명은 무시한다", () => {
    expect(inferExplicitRegion("서울 말고 부산")).toBe("BUSAN");
    expect(inferExplicitRegion("경기 아니고 서울요")).toBe("SEOUL");
  });

  it("광역 표기도 매핑한다", () => {
    expect(inferExplicitRegion("경북이요")).toBe("GYEONGBUK");
    expect(inferExplicitRegion("서울")).toBe("SEOUL");
  });

  it("구미·죽전·광주·고성 단독은 중의로 되묻는다", () => {
    expect(resolveRegionFromMessage("구미로 이사하고 싶어요")).toMatchObject({
      type: "ambiguous",
      clarify: { query: "구미" },
    });
    expect(resolveRegionFromMessage("죽전")).toMatchObject({
      type: "ambiguous",
      clarify: { query: "죽전" },
    });
    expect(resolveRegionFromMessage("죽전으로 이사")).toMatchObject({ type: "ambiguous" });
    expect(resolveRegionFromMessage("광주요")).toMatchObject({ type: "ambiguous" });
    expect(resolveRegionFromMessage("고성")).toMatchObject({ type: "ambiguous" });
    expect(inferExplicitRegion("구미")).toBeNull();
    expect(inferExplicitRegion("죽전")).toBeNull();
  });

  it("구체적 표기는 중의를 해소한다", () => {
    expect(resolveRegionFromMessage("경북 구미")).toEqual({
      type: "resolved",
      region: "GYEONGBUK",
    });
    expect(resolveRegionFromMessage("성남시 구미동")).toEqual({
      type: "resolved",
      region: "GYEONGGI",
    });
    expect(resolveRegionFromMessage("용인 죽전")).toEqual({
      type: "resolved",
      region: "GYEONGGI",
    });
    expect(resolveRegionFromMessage("대구 죽전")).toEqual({
      type: "resolved",
      region: "DAEGU",
    });
    expect(resolveRegionFromMessage("광주광역시")).toEqual({
      type: "resolved",
      region: "GWANGJU",
    });
    expect(resolveRegionFromMessage("경기 광주")).toEqual({
      type: "resolved",
      region: "GYEONGGI",
    });
  });

  it("중의 되묻기 문구·와/과를 만든다", () => {
    const gumi = resolveRegionFromMessage("구미");
    expect(gumi.type).toBe("ambiguous");
    if (gumi.type !== "ambiguous") return;
    expect(buildClarifyRegionReply(gumi.clarify)).toBe(
      "말씀하신 지역이 **경상북도 구미시**와 **경기도 성남시 구미동** 중에 어떤 곳일까요?"
    );

    const jukjeon = resolveRegionFromMessage("죽전");
    expect(jukjeon.type).toBe("ambiguous");
    if (jukjeon.type !== "ambiguous") return;
    expect(buildClarifyRegionReply(jukjeon.clarify)).toBe(
      "말씀하신 **죽전**은 여러 지역에 있어요. 아래에서 고르시거나 시·도를 함께 알려주세요."
    );
    expect(jukjeon.clarify.options).toHaveLength(7);

    const goseong = resolveRegionFromMessage("고성");
    expect(goseong.type).toBe("ambiguous");
    if (goseong.type !== "ambiguous") return;
    // '군' 받침 → 과
    expect(buildClarifyRegionReply(goseong.clarify)).toContain("고성군**과");
  });

  it("중의 후보를 말·번호로 고른다", () => {
    const jukjeon = resolveRegionFromMessage("죽전");
    expect(jukjeon.type).toBe("ambiguous");
    if (jukjeon.type !== "ambiguous") return;

    expect(matchClarifyRegionChoice("용인 쪽이요", jukjeon.clarify)).toBe("GYEONGGI");
    expect(matchClarifyRegionChoice("2번", jukjeon.clarify)).toBe("DAEGU");
    expect(matchClarifyRegionChoice("경북이요", jukjeon.clarify)).toBe("GYEONGBUK");
    expect(matchClarifyRegionChoice("네, 경북이요", jukjeon.clarify)).toBe("GYEONGBUK");
    expect(matchClarifyRegionChoice("대구 죽전동이요", jukjeon.clarify)).toBe("DAEGU");
    expect(matchClarifyRegionChoice("두번째", jukjeon.clarify)).toBe("DAEGU");
  });

  it("검증된 후보만 노출하고 다른 중의 키로 해소한다", () => {
    const sinchon = resolveRegionFromMessage("신촌");
    if (sinchon.type !== "ambiguous") throw new Error("ambiguous 기대");
    expect(sinchon.clarify.options.map((o) => o.region)).not.toContain("DAEGU");

    const daesan = resolveRegionFromMessage("대산");
    if (daesan.type !== "ambiguous") throw new Error("ambiguous 기대");
    expect(daesan.clarify.options.some((o) => o.label.includes("김해"))).toBe(false);

    expect(resolveRegionFromMessage("창원 대산면")).toEqual({
      type: "resolved",
      region: "GYEONGNAM",
    });
    expect(resolveRegionFromMessage("구미 송정동")).toEqual({
      type: "resolved",
      region: "GYEONGBUK",
    });
  });
});

describe("resolveNextAction", () => {
  it("CLARIFY_UNSUPPORTED는 유지하고 CLARIFY_REGION은 ASK_REGION으로 내린다", () => {
    expect(
      resolveNextAction(
        { region: "SEOUL", service: "SMALL", sort: "rating" },
        "CLARIFY_UNSUPPORTED"
      )
    ).toBe("CLARIFY_UNSUPPORTED");
    expect(resolveNextAction({ region: null, service: null, sort: null }, "CLARIFY_REGION")).toBe(
      "ASK_REGION"
    );
  });

  it("CLARIFY_REGION UI에 후보 칩을 붙인다", () => {
    const ui = buildUi({
      nextAction: "CLARIFY_REGION",
      regionClarify: {
        query: "구미",
        options: [
          { label: "경상북도 구미시", region: "GYEONGBUK" },
          { label: "경기도 성남시 구미동", region: "GYEONGGI" },
        ],
      },
    });
    expect(ui.chips).toEqual([
      {
        id: "region_GYEONGBUK_0",
        label: "경상북도 구미시",
        action: "SELECT_REGION",
        value: "GYEONGBUK",
      },
      {
        id: "region_GYEONGGI_1",
        label: "경기도 성남시 구미동",
        action: "SELECT_REGION",
        value: "GYEONGGI",
      },
    ]);
  });

  it("빈 슬롯 순서대로 ASK_* 를 반환한다", () => {
    expect(resolveNextAction({ region: null, service: null, sort: null }, "SHOW_MOVERS")).toBe(
      "ASK_REGION"
    );
    expect(resolveNextAction({ region: "SEOUL", service: null, sort: null }, "SHOW_MOVERS")).toBe(
      "ASK_SERVICE"
    );
    expect(resolveNextAction({ region: null, service: "SMALL", sort: null }, "ASK_SERVICE")).toBe(
      "ASK_REGION"
    );
    expect(resolveNextAction({ region: "SEOUL", service: "SMALL", sort: null }, "ASK_SORT")).toBe(
      "ASK_SORT"
    );
  });

  it("세 슬롯이 채워지면 SHOW_MOVERS", () => {
    expect(
      resolveNextAction({ region: "SEOUL", service: "HOME", sort: "review" }, "ASK_REGION")
    ).toBe("SHOW_MOVERS");
  });
});

describe("geminiMoverAiResultSchema", () => {
  it("유효한 Gemini JSON을 통과시킨다", () => {
    const parsed = geminiMoverAiResultSchema.parse({
      reply: "서울이시군요. 이사 유형을 골라주세요.",
      filters: { region: "SEOUL", service: null, sort: null },
      nextAction: "ASK_SERVICE",
    });
    expect(parsed.filters.region).toBe("SEOUL");
  });

  it("가격·일정 안내는 CLARIFY_UNSUPPORTED를 허용한다", () => {
    const parsed = geminiMoverAiResultSchema.parse({
      reply: "가격 조건으로는 아직 찾아드릴 수 없어요.",
      filters: { region: "SEOUL", service: "SMALL", sort: "rating" },
      nextAction: "CLARIFY_UNSUPPORTED",
    });
    expect(parsed.nextAction).toBe("CLARIFY_UNSUPPORTED");
  });
});

describe("postMessageSchema", () => {
  it("칩 SELECT_SERVICE·SELECT_REGION을 파싱한다", () => {
    const parsed = postMessageSchema.parse({
      message: "소형이사",
      clientAction: { type: "SELECT_SERVICE", value: "SMALL" },
    });
    expect(parsed.clientAction).toEqual({ type: "SELECT_SERVICE", value: "SMALL" });

    const regionParsed = postMessageSchema.parse({
      message: "경상북도 구미시",
      clientAction: { type: "SELECT_REGION", value: "GYEONGBUK" },
    });
    expect(regionParsed.clientAction).toEqual({
      type: "SELECT_REGION",
      value: "GYEONGBUK",
    });
  });

  it("clientAction 없이도 허용한다", () => {
    const parsed = postMessageSchema.parse({ message: "서울이요" });
    expect(parsed.clientAction).toBeNull();
  });
});
