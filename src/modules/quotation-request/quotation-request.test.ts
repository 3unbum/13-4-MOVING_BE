import {
  quotationRequestCreateSchema,
  quotationRequestListQuerySchema,
  quotationRequestIdParamsSchema,
  targetedRequestCreateSchema,
} from "./quotation-request.schema";

describe("quotationRequestCreateSchema", () => {
  /** n일 뒤 날짜를 YYYY-MM-DD로 반환합니다. 스키마가 로컬 날짜 기분이라 UTC 변환을 피합니다. */
  const day = (n: number) => {
    const date = new Date();
    date.setDate(date.getDate() + n);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const valid = {
    category: "OFFICE",
    movingDate: day(30),
    from: {
      postalCode: "06234",
      region: "SEOUL",
      address: "서울 강남구 테헤란로 123",
      detailAddress: "101동 1001호",
    },
    to: {
      postalCode: "48058",
      region: "BUSAN",
      address: "부산 해운대구 해운대로 570",
      detailAddress: "202동 2002호",
    },
  };

  it("올바른 입력을 통과시킨다", () => {
    expect(quotationRequestCreateSchema.safeParse(valid).success).toBe(true);
  });

  describe("이사 예정일", () => {
    it("당일이면 실패한다", () => {
      const result = quotationRequestCreateSchema.safeParse({ ...valid, movingDate: day(0) });
      expect(result.success).toBe(false);
    });

    it("과거면 실패한다", () => {
      const result = quotationRequestCreateSchema.safeParse({ ...valid, movingDate: day(-1) });
      expect(result.success).toBe(false);
    });

    it("내일이면 통과한다", () => {
      expect(quotationRequestCreateSchema.safeParse({ ...valid, movingDate: day(1) }).success).toBe(
        true
      );
    });
  });

  describe("출발지·도착지", () => {
    it("완전히 같으면 실패한다", () => {
      const result = quotationRequestCreateSchema.safeParse({ ...valid, to: { ...valid.from } });
      expect(result.success).toBe(false);
    });

    it("우편번호가 같아도 상세 주소가 다르면 통과한다", () => {
      const result = quotationRequestCreateSchema.safeParse({
        ...valid,
        to: { ...valid.from, detailAddress: "303동 3003호" },
      });
      expect(result.success).toBe(true);
    });

    it("우편번호·상세주소가 같아도 건물이 다르면 통과한다", () => {
      const result = quotationRequestCreateSchema.safeParse({
        ...valid,
        to: { ...valid.from, address: "서울 강남구 테헤란로 456" },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("이사 유형", () => {
    it("정의되지 않은 값이면 실패한다", () => {
      const result = quotationRequestCreateSchema.safeParse({ ...valid, category: "포장이사" });
      expect(result.success).toBe(false);
    });

    it("배열로 보내면 실패한다 (단일 선택만 허용)", () => {
      const result = quotationRequestCreateSchema.safeParse({
        ...valid,
        category: ["SMALL", "HOME"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("필수 필드", () => {
    it("우편번호가 비면 실패한다", () => {
      const result = quotationRequestCreateSchema.safeParse({
        ...valid,
        from: { ...valid.from, postalCode: "" },
      });
      expect(result.success).toBe(false);
    });

    it("지역이 정의되지 않은 값이면 실패한다", () => {
      const result = quotationRequestCreateSchema.safeParse({
        ...valid,
        from: { ...valid.from, region: "제주도" },
      });
      expect(result.success).toBe(false);
    });

    it("도착지가 없으면 실패한다", () => {
      const { to: _to, ...withoutTo } = valid;
      expect(quotationRequestCreateSchema.safeParse(withoutTo).success).toBe(false);
    });
  });
});

describe("quotationRequestListQuerySchema", () => {
  it("쿼리가 없으면 기본값을 채운다", () => {
    const result = quotationRequestListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
      expect(result.data.status).toBeUndefined();
    }
  });

  it("문자열 숫자를 number로 변환한다", () => {
    const result = quotationRequestListQuerySchema.safeParse({ page: "3", limit: "20" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(20);
    }
  });

  it("status=pending을 허용한다", () => {
    const result = quotationRequestListQuerySchema.safeParse({ status: "pending" });
    expect(result.success).toBe(true);
  });

  it("정의되지 않은 status는 거부한다", () => {
    expect(quotationRequestListQuerySchema.safeParse({ status: "done" }).success).toBe(false);
  });

  it("limit이 50을 넘으면 실패한다", () => {
    expect(quotationRequestListQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
  });

  it("page가 0 이하면 실패한다", () => {
    expect(quotationRequestListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
});

describe("quotationRequestIdParamsSchema", () => {
  it("양의 정수 문자열을 number로 변환한다", () => {
    const result = quotationRequestIdParamsSchema.safeParse({ id: "5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(5);
  });

  it("숫자가 아니면 실패한다", () => {
    expect(quotationRequestIdParamsSchema.safeParse({ id: "abc" }).success).toBe(false);
  });

  it("소수면 실패한다", () => {
    expect(quotationRequestIdParamsSchema.safeParse({ id: "1.5" }).success).toBe(false);
  });

  it("0 이하면 실패한다", () => {
    expect(quotationRequestIdParamsSchema.safeParse({ id: "0" }).success).toBe(false);
    expect(quotationRequestIdParamsSchema.safeParse({ id: "-1" }).success).toBe(false);
  });
});

describe("targetedRequestCreateSchema", () => {
  it("양의 정수를 통과시킨다", () => {
    expect(targetedRequestCreateSchema.safeParse({ moverId: 5 }).success).toBe(true);
  });

  it("숫자 문자열도 통과시킨다 (coerce)", () => {
    expect(targetedRequestCreateSchema.safeParse({ moverId: "5" }).success).toBe(true);
  });

  it("0 이하면 실패한다", () => {
    expect(targetedRequestCreateSchema.safeParse({ moverId: 0 }).success).toBe(false);
  });

  it("moverId가 없으면 실패한다", () => {
    expect(targetedRequestCreateSchema.safeParse({}).success).toBe(false);
  });
});
