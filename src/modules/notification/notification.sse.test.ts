import type { Response } from "express";
import { countConnections, openStream, publishNotification } from "./notification.sse";

const HEARTBEAT_MS = 25_000;

/** SSE가 쓰는 부분만 갖춘 가짜 Response */
function makeRes() {
  const handlers = new Map<string, () => void>();
  return {
    writeHead: jest.fn(),
    write: jest.fn(() => true),
    destroy: jest.fn(),
    writableEnded: false,
    destroyed: false,
    on: jest.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
    }),
    emit(event: string) {
      handlers.get(event)?.();
    },
  } as unknown as Response & {
    writeHead: jest.Mock;
    write: jest.Mock;
    destroy: jest.Mock;
    writableEnded: boolean;
    destroyed: boolean;
    emit: (event: string) => void;
  };
}

type FakeRes = ReturnType<typeof makeRes>;

/** 테스트가 남긴 연결을 다음 테스트로 흘리지 않도록 직접 닫습니다 */
let openedStreams: (() => void)[] = [];

function open(userId: number, res: FakeRes) {
  const close = openStream(userId, res);
  openedStreams.push(close);
  return close;
}

beforeEach(() => {
  jest.useFakeTimers();
  openedStreams = [];
});

afterEach(() => {
  openedStreams.forEach((close) => close());
  jest.useRealTimers();
});

describe("openStream", () => {
  it("SSE 헤더와 버퍼링 방지 헤더를 내려준다", () => {
    // Setup
    const res = makeRes();

    // Exercise
    open(7, res);

    // Assertion — X-Accel-Buffering이 없으면 프록시가 이벤트를 모아둡니다
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      })
    );
  });

  it("연결 직후 재연결 간격과 주석을 흘려보낸다", () => {
    // Setup
    const res = makeRes();

    // Exercise
    open(7, res);

    // Assertion
    expect(res.write).toHaveBeenCalledWith("retry: 5000\n: connected\n\n");
  });

  it("heartbeat 주기마다 주석을 보낸다", () => {
    // Setup
    const res = makeRes();
    open(7, res);
    res.write.mockClear();

    // Exercise
    jest.advanceTimersByTime(HEARTBEAT_MS);

    // Assertion — 프록시가 유휴 연결을 끊지 않도록
    expect(res.write).toHaveBeenCalledWith(": ping\n\n");
  });

  it("반환된 함수를 부르면 연결과 heartbeat가 정리된다", () => {
    // Setup
    const res = makeRes();
    const close = open(7, res);
    expect(countConnections(7)).toBe(1);

    // Exercise
    close();
    res.write.mockClear();
    jest.advanceTimersByTime(HEARTBEAT_MS * 2);

    // Assertion
    expect(countConnections(7)).toBe(0);
    expect(res.write).not.toHaveBeenCalled();
  });

  it("같은 유저가 여러 탭을 열면 연결이 함께 유지된다", () => {
    // Setup + Exercise
    open(7, makeRes());
    open(7, makeRes());

    // Assertion
    expect(countConnections(7)).toBe(2);
  });
});

describe("publishNotification", () => {
  it("해당 유저의 모든 연결에 이벤트를 보낸다", () => {
    // Setup
    const first = makeRes();
    const second = makeRes();
    open(7, first);
    open(7, second);
    first.write.mockClear();
    second.write.mockClear();

    // Exercise
    publishNotification([7], { type: "NEW_ESTIMATE" });

    // Assertion
    const expected = 'event: notification\ndata: {"type":"NEW_ESTIMATE"}\n\n';
    expect(first.write).toHaveBeenCalledWith(expected);
    expect(second.write).toHaveBeenCalledWith(expected);
  });

  it("다른 유저에게는 보내지 않는다", () => {
    // Setup
    const mine = makeRes();
    const others = makeRes();
    open(7, mine);
    open(8, others);
    mine.write.mockClear();
    others.write.mockClear();

    // Exercise
    publishNotification([7], { type: "MOVING_DAY" });

    // Assertion
    expect(mine.write).toHaveBeenCalled();
    expect(others.write).not.toHaveBeenCalled();
  });

  it("중복 수신자에게 두 번 보내지 않는다", () => {
    // Setup — 기사님과 고객이 같은 id로 들어올 일은 없지만 호출부 실수를 흡수합니다
    const res = makeRes();
    open(7, res);
    res.write.mockClear();

    // Exercise
    publishNotification([7, 7], { type: "ESTIMATE_CONFIRMED" });

    // Assertion
    expect(res.write).toHaveBeenCalledTimes(1);
  });

  it("접속하지 않은 유저에게 보내도 터지지 않는다", () => {
    // Exercise + Assertion — 알림은 DB에 남았으니 목록 조회로 보면 됩니다
    expect(() => publishNotification([999], { type: "NEW_REQUEST" })).not.toThrow();
  });

  it("이미 닫힌 연결은 이벤트를 보내지 않고 정리한다", () => {
    // Setup
    const res = makeRes();
    open(7, res);
    res.writableEnded = true;
    res.write.mockClear();

    // Exercise
    publishNotification([7], { type: "NEW_REQUEST" });

    // Assertion
    expect(res.write).not.toHaveBeenCalled();
    expect(countConnections(7)).toBe(0);
  });

  it("쓰기가 실패하면 연결을 끊어낸다", () => {
    // Setup — 소켓이 죽으면 write가 throw합니다
    const res = makeRes();
    open(7, res);
    res.write.mockClear();
    res.write.mockImplementation(() => {
      throw new Error("소켓 종료");
    });

    // Exercise
    publishNotification([7], { type: "NEW_REQUEST" });
    jest.advanceTimersByTime(HEARTBEAT_MS);

    // Assertion — 끊어진 연결이 Map에 쌓이면 다음 발행마다 계속 실패합니다
    expect(countConnections(7)).toBe(0);
    expect(res.write).toHaveBeenCalledTimes(1);
  });

  it("write가 false를 반환하면 연결을 끊는다", () => {
    // Setup — 버퍼가 가득 차면 write가 false를 반환합니다
    const res = makeRes();
    open(7, res);
    res.write.mockClear();
    res.write.mockReturnValue(false);

    // Exercise
    publishNotification([7], { type: "NEW_REQUEST" });

    // Assertion
    expect(res.destroy).toHaveBeenCalled();
    expect(countConnections(7)).toBe(0);
  });

  it("destroy된 소켓에는 쓰지 않고 연결을 정리한다", () => {
    // Setup
    const res = makeRes();
    open(7, res);
    res.destroyed = true;
    res.write.mockClear();

    // Exercise
    publishNotification([7], { type: "NEW_REQUEST" });

    // Assertion
    expect(res.write).not.toHaveBeenCalled();
    expect(countConnections(7)).toBe(0);
  });

  it("응답 error가 오면 heartbeat를 멈춘다", () => {
    // Setup
    const res = makeRes();
    open(7, res);
    res.write.mockClear();

    // Exercise
    res.emit("error");
    jest.advanceTimersByTime(HEARTBEAT_MS);

    // Assertion
    expect(countConnections(7)).toBe(0);
    expect(res.write).not.toHaveBeenCalled();
  });
});
