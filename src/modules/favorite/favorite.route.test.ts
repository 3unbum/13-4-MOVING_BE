import express from "express";
import request from "supertest";
import type { RequestHandler, ErrorRequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { favoriteService } from "./favorite.service";

jest.mock("../../common/middlewares/auth", () => ({
  requireAuth: ((req, _res, next) => {
    req.user = { id: 1, role: "CUSTOMER" };
    next();
  }) as RequestHandler,
}));

jest.mock("../../common/middlewares/role", () => ({
  requireRole: () => ((_req, _res, next) => next()) as RequestHandler,
}));

jest.mock("./favorite.service", () => ({
  favoriteService: {
    list: jest.fn(),
    create: jest.fn(),
    bulkDelete: jest.fn(),
  },
}));

import favoriteRouter from "./favorite.route";

const mockedService = jest.mocked(favoriteService);

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
  app.use("/api/favorites", favoriteRouter);
  app.use(testErrorHandler);
  return app;
}

describe("GET /api/favorites", () => {
  beforeEach(() => jest.clearAllMocks());

  it("전체 목록을 data로 반환한다", async () => {
    mockedService.list.mockResolvedValue({ items: [], total: 0 });

    const res = await request(buildApp()).get("/api/favorites");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { items: [], total: 0 } });
    expect(mockedService.list).toHaveBeenCalledWith(1, undefined);
  });

  it("limit=3을 서비스에 넘긴다", async () => {
    mockedService.list.mockResolvedValue({ items: [], total: 0 });

    const res = await request(buildApp()).get("/api/favorites").query({ limit: 3 });

    expect(res.status).toBe(200);
    expect(mockedService.list).toHaveBeenCalledWith(1, 3);
  });

  it("limit=4면 400을 반환한다", async () => {
    const res = await request(buildApp()).get("/api/favorites").query({ limit: 4 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedService.list).not.toHaveBeenCalled();
  });
});

describe("POST /api/favorites", () => {
  beforeEach(() => jest.clearAllMocks());

  it("찜을 생성하고 201을 반환한다", async () => {
    mockedService.create.mockResolvedValue({
      id: 10,
      nickName: "믿음직한 이사왕",
      bio: "고객 만족을 최우선으로 생각합니다",
      image: null,
      avgRating: 4.5,
      reviewCount: 12,
      confirmedCount: 8,
      favoriteCount: 4,
      services: ["HOME"],
      regions: ["SEOUL"],
    });

    const res = await request(buildApp()).post("/api/favorites").send({ moverId: 10 });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(10);
    expect(mockedService.create).toHaveBeenCalledWith(1, 10);
  });

  it("moverId가 없으면 400을 반환한다", async () => {
    const res = await request(buildApp()).post("/api/favorites").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedService.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/favorites", () => {
  beforeEach(() => jest.clearAllMocks());

  it("moverIds로 다중 삭제를 수행한다", async () => {
    mockedService.bulkDelete.mockResolvedValue({
      deletedCount: 2,
      deletedMoverIds: [10, 11],
    });

    const res = await request(buildApp()).delete("/api/favorites").send({ moverIds: [10, 11] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { deletedCount: 2, deletedMoverIds: [10, 11] },
    });
    expect(mockedService.bulkDelete).toHaveBeenCalledWith(1, [10, 11]);
  });

  it("빈 moverIds면 400을 반환한다", async () => {
    const res = await request(buildApp()).delete("/api/favorites").send({ moverIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedService.bulkDelete).not.toHaveBeenCalled();
  });
});
