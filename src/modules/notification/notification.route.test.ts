import express from "express";
import request from "supertest";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { notificationService } from "./notification.service";

jest.mock("../../common/middlewares/auth", () => ({
  requireAuth: ((req, _res, next) => {
    req.user = { id: 1, role: "MOVER" };
    next();
  }) as RequestHandler,
}));

jest.mock("../../common/middlewares/role", () => ({
  requireRole: () => ((_req, _res, next) => next()) as RequestHandler,
}));

jest.mock("./notification.service", () => ({
  notificationService: {
    list: jest.fn(),
    summarize: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    delete: jest.fn(),
    bulkDelete: jest.fn(),
  },
}));

jest.mock("./notification.sse", () => ({
  openStream: jest.fn((_userId: number, res: { status: (code: number) => { end: () => void } }) => {
    // 실제 스트림은 열어두지 않습니다. 라우트가 컨트롤러까지 도달하는지만 봅니다.
    res.status(200).end();
    return jest.fn();
  }),
}));

import notificationRouter from "./notification.route";
import { openStream } from "./notification.sse";

const mockedService = jest.mocked(notificationService);
const mockedOpenStream = jest.mocked(openStream);

const testErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  res.status(500).json({ error: { message: (error as Error).message } });
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/notifications", notificationRouter);
  app.use(testErrorHandler);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe("GET /api/notifications", () => {
  it("목록을 data로 반환한다", async () => {
    mockedService.list.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 });

    const res = await request(buildApp()).get("/api/notifications");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { items: [], nextCursor: null, unreadCount: 0 } });
    expect(mockedService.list).toHaveBeenCalledWith(1, {});
  });

  it("cursor·take를 숫자로 변환해 넘긴다", async () => {
    mockedService.list.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 });

    await request(buildApp()).get("/api/notifications").query({ cursor: 12, take: 5 });

    expect(mockedService.list).toHaveBeenCalledWith(1, { cursor: 12, take: 5 });
  });

  it("take가 20을 넘으면 400을 반환한다", async () => {
    const res = await request(buildApp()).get("/api/notifications").query({ take: 21 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedService.list).not.toHaveBeenCalled();
  });
});

describe("GET /api/notifications/stream", () => {
  it("stream이 :id 라우트로 먹히지 않고 SSE를 연다", async () => {
    const res = await request(buildApp()).get("/api/notifications/stream");

    expect(res.status).toBe(200);
    expect(mockedOpenStream).toHaveBeenCalled();
    expect(mockedOpenStream.mock.calls[0]?.[0]).toBe(1);
  });
});

describe("GET /api/notifications/summary", () => {
  it("요약을 반환한다", async () => {
    mockedService.summarize.mockResolvedValue({
      items: [{ region: "GYEONGGI", category: "SMALL", count: 3 }],
      totalCount: 3,
    });

    const res = await request(buildApp()).get("/api/notifications/summary");

    expect(res.status).toBe(200);
    expect(res.body.data.totalCount).toBe(3);
    expect(mockedService.summarize).toHaveBeenCalledWith(1);
  });

  it("summary가 :id 라우트로 먹히지 않는다", async () => {
    mockedService.summarize.mockResolvedValue({ items: [], totalCount: 0 });

    await request(buildApp()).get("/api/notifications/summary");

    expect(mockedService.summarize).toHaveBeenCalled();
  });
});

describe("PATCH /api/notifications/read-all", () => {
  it("전체 읽음 처리한다", async () => {
    mockedService.markAllRead.mockResolvedValue({ updatedCount: 3 });

    const res = await request(buildApp()).patch("/api/notifications/read-all");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { updatedCount: 3 } });
    expect(mockedService.markAllRead).toHaveBeenCalledWith(1);
  });

  it("read-all이 :id/read 라우트로 잡히지 않는다", async () => {
    mockedService.markAllRead.mockResolvedValue({ updatedCount: 0 });

    await request(buildApp()).patch("/api/notifications/read-all");

    expect(mockedService.markRead).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/notifications/:id/read", () => {
  it("단건 읽음 처리한다", async () => {
    mockedService.markRead.mockResolvedValue({ id: 42, isRead: true });

    const res = await request(buildApp()).patch("/api/notifications/42/read");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 42, isRead: true } });
    expect(mockedService.markRead).toHaveBeenCalledWith(1, 42);
  });

  it("id가 숫자가 아니면 400을 반환한다", async () => {
    const res = await request(buildApp()).patch("/api/notifications/abc/read");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedService.markRead).not.toHaveBeenCalled();
  });

  it("서비스가 404를 던지면 그대로 내려준다", async () => {
    mockedService.markRead.mockRejectedValue(AppError.notFound("알림을 찾을 수 없습니다"));

    const res = await request(buildApp()).patch("/api/notifications/42/read");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("DELETE /api/notifications/:id", () => {
  it("단건 삭제한다", async () => {
    mockedService.delete.mockResolvedValue({ deletedCount: 1, deletedIds: [42] });

    const res = await request(buildApp()).delete("/api/notifications/42");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { deletedCount: 1, deletedIds: [42] } });
    expect(mockedService.delete).toHaveBeenCalledWith(1, 42);
  });
});

describe("DELETE /api/notifications", () => {
  it("ids로 다중 삭제한다", async () => {
    mockedService.bulkDelete.mockResolvedValue({ deletedCount: 2, deletedIds: [10, 11] });

    const res = await request(buildApp())
      .delete("/api/notifications")
      .send({ ids: [10, 11] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { deletedCount: 2, deletedIds: [10, 11] } });
    expect(mockedService.bulkDelete).toHaveBeenCalledWith(1, [10, 11]);
  });

  it("빈 ids면 400을 반환한다", async () => {
    const res = await request(buildApp()).delete("/api/notifications").send({ ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedService.bulkDelete).not.toHaveBeenCalled();
  });
});
