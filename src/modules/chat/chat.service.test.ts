import { chatRepository, isRoomClosed } from "./chat.repository";
import { chatService } from "./chat.service";

jest.mock("./chat.storage", () => ({ uploadChatImage: jest.fn() }));
jest.mock("./chat.repository", () => ({
  chatRepository: { findRoomsByUser: jest.fn(), countUnreadByRoom: jest.fn() },
  isRoomClosed: jest.fn(() => false),
}));

const mockedRepository = jest.mocked(chatRepository);

const lastMessageAt = new Date("2026-10-02T04:00:00.000Z");

function makeRoom(id: number, overrides = {}) {
  return {
    id,
    estimateId: 40 + id,
    customerId: 7,
    moverId: 5,
    lastMessageAt,
    customerLastReadId: 3,
    moverLastReadId: null,
    customer: { id: 7, name: "김고객", customerProfile: { image: "c.png" } },
    mover: { id: 5, name: "박기사", moverProfile: { nickName: "빠른이사", image: "m.png" } },
    messages: [{ id: 9, content: "안녕하세요", senderId: 5, createdAt: lastMessageAt }],
    estimate: { estimateStatus: "CONFIRMED", updatedAt: lastMessageAt },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // 요청받은 모든 방에 안 읽은 2건이 있다고 둔다
  mockedRepository.countUnreadByRoom.mockImplementation(
    async (_userId, rooms) => new Map(rooms.map((room) => [room.id, 2]))
  );
});

describe("chatService.listRooms", () => {
  it("고객에게는 기사님 닉네임·마지막 메시지·안 읽은 수를 내려준다", async () => {
    mockedRepository.findRoomsByUser.mockResolvedValue([makeRoom(1)] as never);

    const result = await chatService.listRooms(7, "CUSTOMER", {});

    expect(result).toEqual({
      items: [
        {
          id: 1,
          estimateId: 41,
          counterpart: { id: 5, name: "빠른이사", image: "m.png" },
          lastMessage: { id: 9, content: "안녕하세요", senderId: 5, createdAt: lastMessageAt },
          lastMessageAt,
          unreadCount: 2,
          isClosed: false,
        },
      ],
      nextCursor: null,
    });
    // 고객은 customerLastReadId 기준으로, 방 전체를 한 번에 센다
    expect(mockedRepository.countUnreadByRoom).toHaveBeenCalledTimes(1);
    expect(mockedRepository.countUnreadByRoom).toHaveBeenCalledWith(7, [{ id: 1, lastReadId: 3 }]);
  });

  it("기사님에게는 고객 이름을 내려주고 moverLastReadId 기준으로 센다", async () => {
    mockedRepository.findRoomsByUser.mockResolvedValue([makeRoom(1)] as never);

    const result = await chatService.listRooms(5, "MOVER", {});

    expect(result.items[0].counterpart).toEqual({ id: 7, name: "김고객", image: "c.png" });
    expect(mockedRepository.countUnreadByRoom).toHaveBeenCalledWith(5, [
      { id: 1, lastReadId: null },
    ]);
  });

  it("닉네임이 비어 있으면 기사님 이름으로 대체한다", async () => {
    const room = makeRoom(1);
    room.mover.moverProfile = { nickName: " ", image: "m.png" };
    mockedRepository.findRoomsByUser.mockResolvedValue([room] as never);

    const result = await chatService.listRooms(7, "CUSTOMER", {});

    expect(result.items[0].counterpart.name).toBe("박기사");
  });

  it("메시지가 없는 방은 lastMessage가 null이다", async () => {
    mockedRepository.findRoomsByUser.mockResolvedValue([makeRoom(1, { messages: [] })] as never);

    const result = await chatService.listRooms(7, "CUSTOMER", {});

    expect(result.items[0].lastMessage).toBeNull();
  });

  it("take보다 하나 더 읽히면 마지막 방 id를 nextCursor로 준다", async () => {
    mockedRepository.findRoomsByUser.mockResolvedValue([
      makeRoom(3),
      makeRoom(2),
      makeRoom(1),
    ] as never);

    const result = await chatService.listRooms(7, "CUSTOMER", { take: 2 });

    expect(result.items.map((i) => i.id)).toEqual([3, 2]);
    expect(result.nextCursor).toBe(2);
    expect(mockedRepository.findRoomsByUser).toHaveBeenCalledWith(7, "CUSTOMER", undefined, 2);
  });
});

describe("chatService.listRooms — 안 읽은 수 집계", () => {
  it("방 여러 개를 쿼리 한 번으로 세고, 집계에 없는 방은 0으로 둔다", async () => {
    mockedRepository.findRoomsByUser.mockResolvedValue([makeRoom(1), makeRoom(2)] as never);
    mockedRepository.countUnreadByRoom.mockResolvedValue(new Map([[1, 4]]));

    const result = await chatService.listRooms(7, "CUSTOMER", {});

    expect(mockedRepository.countUnreadByRoom).toHaveBeenCalledTimes(1);
    expect(result.items.map((item) => item.unreadCount)).toEqual([4, 0]);
  });
});

describe("닫힌 방", () => {
  it("목록에는 남고 isClosed가 true로 내려간다", async () => {
    mockedRepository.findRoomsByUser.mockResolvedValue([makeRoom(1)] as never);
    jest.mocked(isRoomClosed).mockReturnValueOnce(true);

    const result = await chatService.listRooms(7, "CUSTOMER", {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].isClosed).toBe(true);
  });
});
