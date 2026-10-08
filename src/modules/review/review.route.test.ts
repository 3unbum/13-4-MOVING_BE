import express from "express";
import request from "supertest";
import type { RequestHandler, ErrorRequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { reviewService } from "./review.service";

jest.mock("../../common/middlewares/auth", () => ({
  requireAuth: ((req, _res, next) => {
    req.user = { id: 1, role: "CUSTOMER" };
    next();
  }) as RequestHandler,
}));

jest.mock("../../common/middlewares/role", () => ({
  requireRole: () => ((_req, _res, next) => next()) as RequestHandler,
}));

jest.mock("./review.service", () => ({
  reviewService: {
    listWritable: jest.fn(),
    listWritten: jest.fn(),
    listReceived: jest.fn(),
    confirm: jest.fn(),
    addImage: jest.fn(),
    removeImage: jest.fn(),
  },
}));

import reviewRouter from "./review.route";

const mockedService = jest.mocked(reviewService);

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
  app.use(reviewRouter);
  app.use(testErrorHandler);
  return app;
}

describe("GET /reviews/writable", () => {
  beforeEach(() => jest.clearAllMocks());

  it("작성 가능 목록을 반환한다", async () => {
    mockedService.listWritable.mockResolvedValue({ items: [], nextCursor: null });

    const res = await request(buildApp()).get("/reviews/writable");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { items: [], nextCursor: null } });
    expect(mockedService.listWritable).toHaveBeenCalledWith(1, {});
  });
});

describe("PATCH /reviews/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  it("리뷰를 작성한다", async () => {
    mockedService.confirm.mockResolvedValue({
      id: 7,
      rating: 5,
      comment: "정말 친절하고 안전하게 이사했습니다",
      avgRating: 4.5,
      reviewCount: 3,
    });

    const res = await request(buildApp())
      .patch("/reviews/7")
      .send({ rating: 5, comment: "정말 친절하고 안전하게 이사했습니다" });

    expect(res.status).toBe(200);
    expect(mockedService.confirm).toHaveBeenCalledWith(1, 7, {
      rating: 5,
      comment: "정말 친절하고 안전하게 이사했습니다",
    });
  });

  it("코멘트가 짧으면 400을 반환한다", async () => {
    const res = await request(buildApp())
      .patch("/reviews/7")
      .send({ rating: 5, comment: "좋아요" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedService.confirm).not.toHaveBeenCalled();
  });
});

describe("POST /reviews/:id/images", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  beforeEach(() => jest.clearAllMocks());

  it("image 파일을 서비스에 넘기고 201을 반환한다", async () => {
    mockedService.addImage.mockResolvedValue({ imageUrl: "https://cdn.example/new.jpg" });

    const res = await request(buildApp())
      .post("/reviews/7/images")
      .attach("image", png, { filename: "a.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { imageUrl: "https://cdn.example/new.jpg" } });
    expect(mockedService.addImage).toHaveBeenCalledWith(1, 7, expect.any(Buffer));
  });

  it("허용하지 않는 mimetype은 400이고 서비스까지 가지 않는다", async () => {
    const res = await request(buildApp())
      .post("/reviews/7/images")
      .attach("image", Buffer.from("gif"), { filename: "a.gif", contentType: "image/gif" });

    expect(res.status).toBe(400);
    expect(mockedService.addImage).not.toHaveBeenCalled();
  });

  it("5MB를 넘으면 400", async () => {
    const res = await request(buildApp())
      .post("/reviews/7/images")
      .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "big.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
    expect(mockedService.addImage).not.toHaveBeenCalled();
  });
});

describe("DELETE /reviews/:id/images", () => {
  beforeEach(() => jest.clearAllMocks());

  it("imageUrl로 사진을 지우고 204를 반환한다", async () => {
    mockedService.removeImage.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .delete("/reviews/7/images")
      .send({ imageUrl: "https://cdn.example/1.jpg" });

    expect(res.status).toBe(204);
    expect(mockedService.removeImage).toHaveBeenCalledWith(1, 7, "https://cdn.example/1.jpg");
  });

  it("imageUrl이 없으면 400이고 삭제하지 않는다", async () => {
    const res = await request(buildApp()).delete("/reviews/7/images").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedService.removeImage).not.toHaveBeenCalled();
  });
});

describe("GET /mover/reviews", () => {
  beforeEach(() => jest.clearAllMocks());

  it("받은 리뷰 목록을 반환한다", async () => {
    mockedService.listReceived.mockResolvedValue({ items: [], nextCursor: null });

    const res = await request(buildApp()).get("/mover/reviews");

    expect(res.status).toBe(200);
    expect(mockedService.listReceived).toHaveBeenCalledWith(1, {});
  });
});
