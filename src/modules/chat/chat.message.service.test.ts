import { publishEvent, publishNotification } from "../notification/notification.sse";
import { chatMessageRepository, isRoomClosed } from "./chat.repository";
import { chatMessageService } from "./chat.service";
import { uploadChatImage } from "./chat.storage";

jest.mock("./chat.repository", () => ({
  chatRepository: {},
  isRoomClosed: jest.fn(() => false),
  chatMessageRepository: {
    findRoomForUser: jest.fn(),
    findMessages: jest.fn(),
    createMessage: jest.fn(),
    markRead: jest.fn(),
  },
}));
jest.mock("./chat.storage", () => ({ uploadChatImage: jest.fn() }));
jest.mock("../notification/notification.sse", () => ({
  publishEvent: jest.fn(),
  publishNotification: jest.fn(),
}));

const repo = jest.mocked(chatMessageRepository);

const room = {
  id: 1,
  customerId: 7,
  moverId: 5,
  customerLastReadId: 3,
  moverLastReadId: 8,
  estimate: { estimateStatus: "COMPLETED", updatedAt: new Date("2026-10-01T00:00:00.000Z") },
};
const msg = (id: number) => ({
  id,
  roomId: 1,
  senderId: 7,
  content: "hi",
  createdAt: new Date("2026-10-02T04:00:00.000Z"),
});

beforeEach(() => {
  jest.clearAllMocks();
  repo.findRoomForUser.mockResolvedValue(room as never);
});

describe("참여자가 아닌 경우", () => {
  it("조회·전송·읽음 모두 404", async () => {
    repo.findRoomForUser.mockResolvedValue(null);

    await expect(chatMessageService.listMessages(1, 99, {})).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(chatMessageService.sendMessage(1, 99, { content: "x" })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(chatMessageService.markRead(1, 99)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.createMessage).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });
});

describe("chatMessageService.listMessages", () => {
  it("take+1개가 읽히면 nextCursor를 주고, 고객에게는 기사님의 읽음 위치를 준다", async () => {
    repo.findMessages.mockResolvedValue([msg(30), msg(29), msg(28)] as never);

    const result = await chatMessageService.listMessages(1, 7, { take: 2 });

    expect(result.items.map((m) => m.id)).toEqual([30, 29]);
    expect(result.nextCursor).toBe(29);
    expect(result.counterpartLastReadId).toBe(8);
  });

  it("기사님에게는 고객의 읽음 위치를 준다", async () => {
    repo.findMessages.mockResolvedValue([msg(1)] as never);

    const result = await chatMessageService.listMessages(1, 5, {});

    expect(result.nextCursor).toBeNull();
    expect(result.counterpartLastReadId).toBe(3);
  });
});

describe("chatMessageService.sendMessage", () => {
  it("저장하고 양쪽에 chat 신호, 받는 사람에게 알림 신호를 보낸다", async () => {
    repo.createMessage.mockResolvedValue(msg(31) as never);

    // 기사님(5)이 보내면 받는 사람은 고객(7)
    const result = await chatMessageService.sendMessage(1, 5, { content: "안녕하세요" });

    expect(repo.createMessage).toHaveBeenCalledWith(1, 5, 7, "안녕하세요");
    expect(result.id).toBe(31);
    expect(publishEvent).toHaveBeenCalledWith([7, 5], "chat", {
      type: "MESSAGE",
      roomId: 1,
      messageId: 31,
    });
    expect(publishNotification).toHaveBeenCalledWith([7], { type: "NEW_CHAT_MESSAGE" });
  });

  it("고객이 보내면 알림은 기사님에게만 간다", async () => {
    repo.createMessage.mockResolvedValue(msg(33) as never);

    await chatMessageService.sendMessage(1, 7, { content: "네" });

    expect(repo.createMessage).toHaveBeenCalledWith(1, 7, 5, "네");
    expect(publishNotification).toHaveBeenCalledTimes(1);
    expect(publishNotification).toHaveBeenCalledWith([5], { type: "NEW_CHAT_MESSAGE" });
  });

  it("저장이 실패하면 신호를 보내지 않는다", async () => {
    repo.createMessage.mockRejectedValue(new Error("db"));

    await expect(chatMessageService.sendMessage(1, 7, { content: "x" })).rejects.toThrow("db");
    expect(publishEvent).not.toHaveBeenCalled();
    expect(publishNotification).not.toHaveBeenCalled();
  });
});

/** PNG 시그니처(8바이트) + 임의 데이터 */
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
]);

describe("chatMessageService.sendImage", () => {
  it("참여자가 아니면 업로드하지 않고 404", async () => {
    repo.findRoomForUser.mockResolvedValue(null);

    await expect(chatMessageService.sendImage(1, 99, png)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(uploadChatImage).not.toHaveBeenCalled();
  });

  it("파일이 없거나 이미지 바이트가 아니면 400이고 업로드하지 않는다", async () => {
    await expect(chatMessageService.sendImage(1, 7, undefined)).rejects.toMatchObject({
      statusCode: 400,
    });
    // 확장자·mimetype을 속여도 바이트로 거릅니다
    await expect(chatMessageService.sendImage(1, 7, Buffer.from("<html>"))).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(uploadChatImage).not.toHaveBeenCalled();
    expect(repo.createMessage).not.toHaveBeenCalled();
  });

  it("업로드한 URL로 사진 메시지를 저장하고 양쪽에 신호를 보낸다", async () => {
    jest.mocked(uploadChatImage).mockResolvedValue("https://cdn.test/chat/1/a.png");
    repo.createMessage.mockResolvedValue(msg(32) as never);

    const result = await chatMessageService.sendImage(1, 7, png);

    expect(uploadChatImage).toHaveBeenCalledWith(1, png, {
      mimeType: "image/png",
      extension: "png",
    });
    expect(repo.createMessage).toHaveBeenCalledWith(1, 7, 5, "", "https://cdn.test/chat/1/a.png");
    expect(result.id).toBe(32);
    expect(publishEvent).toHaveBeenCalledWith([7, 5], "chat", {
      type: "MESSAGE",
      roomId: 1,
      messageId: 32,
    });
    expect(publishNotification).toHaveBeenCalledWith([5], { type: "NEW_CHAT_MESSAGE" });
  });

  it("업로드가 실패하면 메시지를 저장하지 않는다", async () => {
    jest.mocked(uploadChatImage).mockRejectedValue(new Error("s3"));

    await expect(chatMessageService.sendImage(1, 7, png)).rejects.toThrow("s3");
    expect(repo.createMessage).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
    expect(publishNotification).not.toHaveBeenCalled();
  });
});

describe("chatMessageService.markRead", () => {
  it("실제로 갱신됐을 때만 상대에게 READ 신호를 보낸다", async () => {
    repo.markRead.mockResolvedValue({ lastReadId: 20, updated: true });

    const result = await chatMessageService.markRead(1, 7);

    expect(repo.markRead).toHaveBeenCalledWith(1, "CUSTOMER", 7);
    expect(result).toEqual({ lastReadId: 20 });
    expect(publishEvent).toHaveBeenCalledWith([5], "chat", { type: "READ", roomId: 1 });
  });

  it("이미 읽은 상태면 신호를 보내지 않는다", async () => {
    repo.markRead.mockResolvedValue({ lastReadId: 20, updated: false });

    await chatMessageService.markRead(1, 7);

    expect(publishEvent).not.toHaveBeenCalled();
  });
});

describe("닫힌 방 (이사 완료 후 14일 경과)", () => {
  beforeEach(() => jest.mocked(isRoomClosed).mockReturnValue(true));
  afterEach(() => jest.mocked(isRoomClosed).mockReturnValue(false));

  it("지난 대화는 볼 수 있고 isClosed가 true다", async () => {
    repo.findMessages.mockResolvedValue([msg(1)] as never);

    const result = await chatMessageService.listMessages(1, 7, {});

    expect(result.items).toHaveLength(1);
    expect(result.isClosed).toBe(true);
  });

  it("읽음 처리는 된다", async () => {
    repo.markRead.mockResolvedValue({ lastReadId: 20, updated: true });

    await expect(chatMessageService.markRead(1, 7)).resolves.toEqual({ lastReadId: 20 });
  });

  it("텍스트 전송은 403 CHAT_ROOM_CLOSED이고 저장·신호가 없다", async () => {
    await expect(chatMessageService.sendMessage(1, 7, { content: "x" })).rejects.toMatchObject({
      statusCode: 403,
      code: "CHAT_ROOM_CLOSED",
    });
    expect(repo.createMessage).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("사진 전송도 403이고 업로드하지 않는다", async () => {
    await expect(chatMessageService.sendImage(1, 7, png)).rejects.toMatchObject({
      statusCode: 403,
      code: "CHAT_ROOM_CLOSED",
    });
    expect(uploadChatImage).not.toHaveBeenCalled();
  });
});
