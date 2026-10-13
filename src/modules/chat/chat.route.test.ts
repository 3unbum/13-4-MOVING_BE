import express from "express";
import request from "supertest";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { chatMessageService, chatService } from "./chat.service";

jest.mock("../../common/middlewares/auth", () => ({
  requireAuth: ((req, _res, next) => {
    req.user = { id: 7, role: "CUSTOMER" };
    next();
  }) as RequestHandler,
}));

// 전송 제한은 rateLimit.test.ts에서 다루므로 여기서는 통과시킵니다
jest.mock("../../common/middlewares/rateLimit", () => ({
  chatMessageRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
}));

jest.mock("./chat.service", () => ({
  chatService: { listRooms: jest.fn() },
  chatMessageService: {
    listMessages: jest.fn(),
    sendMessage: jest.fn(),
    sendImage: jest.fn(),
    markRead: jest.fn(),
  },
}));

import chatRouter from "./chat.route";

const rooms = jest.mocked(chatService);
const messages = jest.mocked(chatMessageService);

const testErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }
  res.status(500).json({ error: { message: (error as Error).message } });
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/chat-rooms", chatRouter);
  app.use(testErrorHandler);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe("GET /api/chat-rooms", () => {
  it("내 id·role로 목록을 조회하고 cursor·take를 숫자로 넘긴다", async () => {
    rooms.listRooms.mockResolvedValue({ items: [], nextCursor: null });

    const res = await request(buildApp()).get("/api/chat-rooms?cursor=4&take=5");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { items: [], nextCursor: null } });
    expect(rooms.listRooms).toHaveBeenCalledWith(7, "CUSTOMER", { cursor: 4, take: 5 });
  });

  it("take가 20을 넘으면 400", async () => {
    const res = await request(buildApp()).get("/api/chat-rooms?take=21");

    expect(res.status).toBe(400);
    expect(rooms.listRooms).not.toHaveBeenCalled();
  });
});

describe("GET /api/chat-rooms/:id/messages", () => {
  it("방 id와 쿼리를 숫자로 넘기고 결과를 data로 반환한다", async () => {
    messages.listMessages.mockResolvedValue({
      items: [],
      nextCursor: null,
      counterpartLastReadId: null,
      isClosed: false,
    });

    const res = await request(buildApp()).get("/api/chat-rooms/3/messages?take=50");

    expect(res.status).toBe(200);
    expect(messages.listMessages).toHaveBeenCalledWith(3, 7, { take: 50 });
  });

  it("take가 50을 넘거나 id가 숫자가 아니면 400", async () => {
    const app = buildApp();

    expect((await request(app).get("/api/chat-rooms/3/messages?take=51")).status).toBe(400);
    expect((await request(app).get("/api/chat-rooms/abc/messages")).status).toBe(400);
    expect(messages.listMessages).not.toHaveBeenCalled();
  });

  it("방 접근 불가는 404를 그대로 전달한다", async () => {
    messages.listMessages.mockRejectedValue(AppError.notFound("채팅방을 찾을 수 없습니다"));

    const res = await request(buildApp()).get("/api/chat-rooms/3/messages");

    expect(res.status).toBe(404);
  });
});

describe("POST /api/chat-rooms/:id/messages", () => {
  it("내용 앞뒤 공백을 지워 저장하고 201을 반환한다", async () => {
    messages.sendMessage.mockResolvedValue({ id: 9 } as never);

    const res = await request(buildApp())
      .post("/api/chat-rooms/3/messages")
      .send({ content: "  안녕하세요  " });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { id: 9 } });
    expect(messages.sendMessage).toHaveBeenCalledWith(3, 7, { content: "안녕하세요" });
  });

  it.each([
    ["빈 문자열", { content: "" }],
    ["공백만", { content: "   " }],
    ["1001자", { content: "a".repeat(1001) }],
    ["content 없음", {}],
  ])("%s는 400이고 저장하지 않는다", async (_name, body) => {
    const res = await request(buildApp()).post("/api/chat-rooms/3/messages").send(body);

    expect(res.status).toBe(400);
    expect(messages.sendMessage).not.toHaveBeenCalled();
  });

  it("1000자는 허용한다", async () => {
    messages.sendMessage.mockResolvedValue({ id: 9 } as never);

    const res = await request(buildApp())
      .post("/api/chat-rooms/3/messages")
      .send({ content: "a".repeat(1000) });

    expect(res.status).toBe(201);
  });
});

describe("POST /api/chat-rooms/:id/images", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it("image 파일을 서비스에 넘기고 201을 반환한다", async () => {
    messages.sendImage.mockResolvedValue({ id: 9 } as never);

    const res = await request(buildApp())
      .post("/api/chat-rooms/3/images")
      .attach("image", png, { filename: "a.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { id: 9 } });
    expect(messages.sendImage).toHaveBeenCalledWith(3, 7, expect.any(Buffer));
  });

  it("허용하지 않는 mimetype은 400이고 서비스까지 가지 않는다", async () => {
    const res = await request(buildApp())
      .post("/api/chat-rooms/3/images")
      .attach("image", Buffer.from("gif"), { filename: "a.gif", contentType: "image/gif" });

    expect(res.status).toBe(400);
    expect(messages.sendImage).not.toHaveBeenCalled();
  });

  it("5MB를 넘으면 400", async () => {
    const res = await request(buildApp())
      .post("/api/chat-rooms/3/images")
      .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "big.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
    expect(messages.sendImage).not.toHaveBeenCalled();
  });

  it("파일이 없으면 서비스가 400을 던진다", async () => {
    messages.sendImage.mockRejectedValue(
      AppError.badRequest("VALIDATION_ERROR", "이미지 파일이 필요합니다.")
    );

    const res = await request(buildApp()).post("/api/chat-rooms/3/images");

    expect(res.status).toBe(400);
    expect(messages.sendImage).toHaveBeenCalledWith(3, 7, undefined);
  });
});

describe("PATCH /api/chat-rooms/:id/read", () => {
  it("읽은 위치를 data로 반환한다", async () => {
    messages.markRead.mockResolvedValue({ lastReadId: 5 });

    const res = await request(buildApp()).patch("/api/chat-rooms/3/read");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { lastReadId: 5 } });
    expect(messages.markRead).toHaveBeenCalledWith(3, 7);
  });
});
