import { ERROR_CODES } from "../../common/errors/errorCodes";
import { notificationRepository } from "./notification.repository";
import {
  createManyNotifications,
  createNotification,
  notificationService,
} from "./notification.service";

jest.mock("./notification.repository", () => ({
  notificationRepository: {
    create: jest.fn(),
    createMany: jest.fn(),
    findManyByUserId: jest.fn(),
    countUnread: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    deleteOwned: jest.fn(),
    summarizeUnreadNewRequests: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(notificationRepository);

/** 실제 트랜잭션은 필요 없습니다 — 그대로 repository에 전달되는지만 봅니다 */
const fakeTx = {} as never;

const movingDate = new Date("2026-10-01T00:00:00.000Z");
const createdAt = new Date("2026-09-28T04:00:00.000Z");

/** findManyByUserId의 include 형태를 흉내 냅니다 */
function row(overrides: Record<string, unknown>) {
  return {
    id: 1,
    isRead: false,
    createdAt,
    estimateId: null,
    quotationRequestId: null,
    message: null,
    estimate: null,
    quotationRequest: null,
    ...overrides,
  };
}

const quotationRequest = {
  category: "SMALL",
  fromRegion: "GYEONGGI",
  fromAddress: "경기 고양시 일산동구",
  toAddress: "서울 영등포구",
  movingDate,
};

const estimate = {
  price: 210000,
  mover: { moverProfile: { nickName: "김코드" } },
  quotationRequest: {
    category: "SMALL",
    fromAddress: "경기 고양시 일산동구",
    toAddress: "서울 영등포구",
    movingDate,
    user: { name: "김가나" },
  },
};

beforeEach(() => jest.clearAllMocks());

describe("createNotification", () => {
  it("받은 tx로 알림을 생성한다", async () => {
    // Exercise
    await createNotification(fakeTx, {
      userId: 7,
      type: "ESTIMATE_CONFIRMED",
      estimateId: 42,
    });

    // Assertion
    expect(mockedRepository.create).toHaveBeenCalledWith(
      { userId: 7, type: "ESTIMATE_CONFIRMED", estimateId: 42 },
      fakeTx
    );
  });
});

describe("createManyNotifications", () => {
  it("여러 건을 한 번에 생성한다", async () => {
    // Setup
    const paramsList = [
      { userId: 1, type: "NEW_REQUEST" as const, quotationRequestId: 5 },
      { userId: 2, type: "NEW_REQUEST" as const, quotationRequestId: 5 },
    ];

    // Exercise
    await createManyNotifications(fakeTx, paramsList);

    // Assertion
    expect(mockedRepository.createMany).toHaveBeenCalledWith(paramsList, fakeTx);
  });

  it("대상이 없으면 DB를 호출하지 않는다", async () => {
    // Exercise
    await createManyNotifications(fakeTx, []);

    // Assertion — 지역에 기사님이 한 명도 없을 때 빈 createMany가 나가지 않아야 합니다
    expect(mockedRepository.createMany).not.toHaveBeenCalled();
  });
});

describe("notificationService.list", () => {
  it("type별로 payload를 조립한다", async () => {
    // Setup
    mockedRepository.findManyByUserId.mockResolvedValue([
      row({ id: 4, type: "NEW_REQUEST", quotationRequestId: 9, quotationRequest }),
      row({ id: 3, type: "NEW_ESTIMATE", estimateId: 42, estimate }),
      row({ id: 2, type: "ESTIMATE_CONFIRMED", estimateId: 42, estimate }),
      row({ id: 1, type: "MOVING_DAY", quotationRequestId: 9, quotationRequest }),
    ] as never);
    mockedRepository.countUnread.mockResolvedValue(4);

    // Exercise
    const result = await notificationService.list(7, {});

    // Assertion
    expect(result.items).toEqual([
      {
        id: 4,
        type: "NEW_REQUEST",
        isRead: false,
        createdAt,
        estimateId: null,
        quotationRequestId: 9,
        payload: { category: "SMALL", fromRegion: "GYEONGGI", movingDate },
      },
      {
        id: 3,
        type: "NEW_ESTIMATE",
        isRead: false,
        createdAt,
        estimateId: 42,
        quotationRequestId: null,
        payload: { moverNickName: "김코드", category: "SMALL", price: 210000 },
      },
      {
        id: 2,
        type: "ESTIMATE_CONFIRMED",
        isRead: false,
        createdAt,
        estimateId: 42,
        quotationRequestId: null,
        payload: { moverNickName: "김코드", customerName: "김가나", category: "SMALL" },
      },
      {
        id: 1,
        type: "MOVING_DAY",
        isRead: false,
        createdAt,
        estimateId: null,
        quotationRequestId: 9,
        payload: { fromAddress: "경기 고양시 일산동구", toAddress: "서울 영등포구", movingDate },
      },
    ]);
    expect(result.nextCursor).toBeNull();
    expect(result.unreadCount).toBe(4);
  });

  it("take+1건을 요청하고 초과분은 잘라낸다", async () => {
    // Setup — take=2인데 3건이 오면 다음 페이지가 있다는 뜻입니다
    mockedRepository.findManyByUserId.mockResolvedValue([
      row({ id: 5, type: "MOVING_DAY", quotationRequestId: 9, quotationRequest }),
      row({ id: 4, type: "MOVING_DAY", quotationRequestId: 9, quotationRequest }),
      row({ id: 3, type: "MOVING_DAY", quotationRequestId: 9, quotationRequest }),
    ] as never);
    mockedRepository.countUnread.mockResolvedValue(0);

    // Exercise
    const result = await notificationService.list(7, { take: 2 });

    // Assertion
    expect(mockedRepository.findManyByUserId).toHaveBeenCalledWith(7, undefined, 3, undefined);
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe(4);
  });

  it("원본이 없는 알림은 목록에서 제외하되 nextCursor는 원본 기준으로 남긴다", async () => {
    // Setup — 기사님이 프로필을 지워 닉네임을 만들 수 없는 행이 마지막에 옵니다
    mockedRepository.findManyByUserId.mockResolvedValue([
      row({ id: 9, type: "MOVING_DAY", quotationRequestId: 9, quotationRequest }),
      row({
        id: 8,
        type: "NEW_ESTIMATE",
        estimateId: 42,
        estimate: { ...estimate, mover: { moverProfile: null } },
      }),
      row({ id: 7, type: "MOVING_DAY", quotationRequestId: 9, quotationRequest }),
    ] as never);
    mockedRepository.countUnread.mockResolvedValue(0);

    // Exercise
    const result = await notificationService.list(7, { take: 2 });

    // Assertion — 걸러진 8이 아니라 실제로 읽은 마지막 행 id를 커서로 써야
    // 다음 페이지에서 8을 다시 읽지 않습니다
    expect(result.items.map((item) => item.id)).toEqual([9]);
    expect(result.nextCursor).toBe(8);
  });

  it("cursor를 그대로 전달한다", async () => {
    // Setup
    mockedRepository.findManyByUserId.mockResolvedValue([] as never);
    mockedRepository.countUnread.mockResolvedValue(0);

    // Exercise
    await notificationService.list(7, { cursor: 12, take: 5 });

    // Assertion
    expect(mockedRepository.findManyByUserId).toHaveBeenCalledWith(7, 12, 6, undefined);
  });

  it("isRead=false면 안 읽은 알림만 조회한다", async () => {
    mockedRepository.findManyByUserId.mockResolvedValue([] as never);
    mockedRepository.countUnread.mockResolvedValue(2);

    await notificationService.list(7, { isRead: "false" });

    expect(mockedRepository.findManyByUserId).toHaveBeenCalledWith(7, undefined, 11, false);
  });
});

describe("notificationService.summarize", () => {
  it("지역·유형별 건수를 합산해 totalCount를 만든다", async () => {
    // Setup
    mockedRepository.summarizeUnreadNewRequests.mockResolvedValue([
      { region: "GYEONGGI", category: "SMALL", count: 3 },
      { region: "SEOUL", category: "HOME", count: 2 },
    ] as never);

    // Exercise
    const result = await notificationService.summarize(7);

    // Assertion
    expect(result).toEqual({
      items: [
        { region: "GYEONGGI", category: "SMALL", count: 3 },
        { region: "SEOUL", category: "HOME", count: 2 },
      ],
      totalCount: 5,
    });
  });

  it("미확인이 없으면 빈 요약을 돌려준다", async () => {
    // Setup
    mockedRepository.summarizeUnreadNewRequests.mockResolvedValue([] as never);

    // Exercise
    const result = await notificationService.summarize(7);

    // Assertion
    expect(result).toEqual({ items: [], totalCount: 0 });
  });
});

describe("notificationService.markRead", () => {
  it("읽음 처리하고 결과를 돌려준다", async () => {
    // Setup
    mockedRepository.markRead.mockResolvedValue(1);

    // Exercise
    const result = await notificationService.markRead(7, 42);

    // Assertion
    expect(result).toEqual({ id: 42, isRead: true });
    expect(mockedRepository.markRead).toHaveBeenCalledWith(7, 42);
  });

  it("대상이 없으면 404를 던진다", async () => {
    // Setup — 남의 알림도 여기로 들어옵니다 (where에 userId가 있어 count가 0)
    mockedRepository.markRead.mockResolvedValue(0);

    // Exercise + Assertion
    await expect(notificationService.markRead(7, 42)).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.NOT_FOUND,
    });
  });
});

describe("notificationService.markAllRead", () => {
  it("읽음 처리된 건수를 돌려준다", async () => {
    // Setup
    mockedRepository.markAllRead.mockResolvedValue(3);

    // Exercise
    const result = await notificationService.markAllRead(7);

    // Assertion
    expect(result).toEqual({ updatedCount: 3 });
  });
});

describe("notificationService.delete", () => {
  it("단건을 삭제한다", async () => {
    // Setup
    mockedRepository.deleteOwned.mockResolvedValue({ deletedCount: 1, deletedIds: [42] });

    // Exercise
    const result = await notificationService.delete(7, 42);

    // Assertion
    expect(result).toEqual({ deletedCount: 1, deletedIds: [42] });
    expect(mockedRepository.deleteOwned).toHaveBeenCalledWith(7, [42]);
  });

  it("대상이 없으면 404를 던진다", async () => {
    // Setup
    mockedRepository.deleteOwned.mockResolvedValue({ deletedCount: 0, deletedIds: [] });

    // Exercise + Assertion
    await expect(notificationService.delete(7, 42)).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.NOT_FOUND,
    });
  });
});

describe("notificationService.bulkDelete", () => {
  it("중복 id를 제거하고 삭제한다", async () => {
    // Setup
    mockedRepository.deleteOwned.mockResolvedValue({ deletedCount: 2, deletedIds: [1, 2] });

    // Exercise
    const result = await notificationService.bulkDelete(7, [1, 2, 1]);

    // Assertion
    expect(mockedRepository.deleteOwned).toHaveBeenCalledWith(7, [1, 2]);
    expect(result).toEqual({ deletedCount: 2, deletedIds: [1, 2] });
  });

  it("하나도 못 지워도 에러 대신 0을 돌려준다", async () => {
    // Setup — 다중 삭제는 일부만 남아 있는 경우가 정상이라 404로 막지 않습니다
    mockedRepository.deleteOwned.mockResolvedValue({ deletedCount: 0, deletedIds: [] });

    // Exercise
    const result = await notificationService.bulkDelete(7, [1, 2]);

    // Assertion
    expect(result).toEqual({ deletedCount: 0, deletedIds: [] });
  });
});
