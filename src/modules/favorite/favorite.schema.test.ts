import {
  bulkDeleteFavoritesSchema,
  createFavoriteSchema,
  listFavoritesQuerySchema,
} from "./favorite.schema";

describe("listFavoritesQuerySchema", () => {
  it("쿼리가 없으면 통과한다", () => {
    const result = listFavoritesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("limit=3을 통과시킨다", () => {
    const result = listFavoritesQuerySchema.safeParse({ limit: "3" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(3);
    }
  });

  it("limit=4면 실패한다", () => {
    expect(listFavoritesQuerySchema.safeParse({ limit: 4 }).success).toBe(false);
  });
});

describe("createFavoriteSchema", () => {
  it("moverId를 통과시킨다", () => {
    expect(createFavoriteSchema.safeParse({ moverId: 10 }).success).toBe(true);
  });

  it("문자열 id도 숫자로 변환한다", () => {
    const result = createFavoriteSchema.safeParse({ moverId: "10" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.moverId).toBe(10);
    }
  });

  it("moverId가 없으면 실패한다", () => {
    expect(createFavoriteSchema.safeParse({}).success).toBe(false);
  });
});

describe("bulkDeleteFavoritesSchema", () => {
  it("moverIds 배열을 통과시킨다", () => {
    expect(bulkDeleteFavoritesSchema.safeParse({ moverIds: [1, 2, 3] }).success).toBe(true);
  });

  it("문자열 id도 숫자로 변환한다", () => {
    const result = bulkDeleteFavoritesSchema.safeParse({ moverIds: ["1", "2"] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.moverIds).toEqual([1, 2]);
    }
  });

  it("빈 배열이면 실패한다", () => {
    expect(bulkDeleteFavoritesSchema.safeParse({ moverIds: [] }).success).toBe(false);
  });

  it("moverIds가 없으면 실패한다", () => {
    expect(bulkDeleteFavoritesSchema.safeParse({}).success).toBe(false);
  });
});
