import {
  balanceDueWhere,
  calcBalanceAmount,
  calcDepositAmount,
  calcDepositDueAt,
  calcExtraChargeMax,
  depositDueWhere,
  kstMonthRange,
  monthRange,
  paymentStageWhere,
  sumExtraCharges,
  toPaymentStage,
} from "./estimate.payment";

describe("calcDepositAmount", () => {
  test("견적 금액의 10%다", () => {
    expect(calcDepositAmount(180000)).toBe(18000);
    expect(calcDepositAmount(1000000)).toBe(100000);
  });

  test("10원 단위로 내림한다", () => {
    // 123,456 × 10% = 12,345.6 → 12,340
    expect(calcDepositAmount(123456)).toBe(12340);
  });

  // 견적 최소가가 1만 원이라 선수금은 1,000원 아래로 내려가지 않는다 (토스 최소 결제 금액 이상)
  test("견적 최소가(1만 원)의 선수금은 1,000원이다", () => {
    expect(calcDepositAmount(10000)).toBe(1000);
  });
});

describe("calcDepositDueAt", () => {
  const HOUR = 60 * 60 * 1000;

  test("이사일이 멀면 확정 후 48시간이다", () => {
    const now = new Date("2026-10-01T03:00:00Z");
    const movingDate = new Date("2026-12-25T00:00:00Z");

    expect(calcDepositDueAt(now, movingDate).getTime()).toBe(now.getTime() + 48 * HOUR);
  });

  // movingDate는 달력일을 UTC 자정으로 저장한다. KST 자정은 거기서 9시간을 뺀 시각이다
  test("이사일이 임박하면 이사일 0시(KST)를 넘지 않는다", () => {
    const now = new Date("2026-10-08T00:00:00Z");
    const movingDate = new Date("2026-10-09T00:00:00Z");

    expect(calcDepositDueAt(now, movingDate).toISOString()).toBe("2026-10-08T15:00:00.000Z");
  });
});

describe("calcBalanceAmount", () => {
  test("잔금은 견적가에서 선수금을 뺀 금액이다", () => {
    expect(calcBalanceAmount({ price: 180000, depositAmount: 18000 })).toBe(162000);
  });

  test("선수금이 없는 옛 견적은 전액이다", () => {
    expect(calcBalanceAmount({ price: 180000, depositAmount: null })).toBe(180000);
  });
});

describe("toPaymentStage", () => {
  const base = {
    estimateStatus: "PENDING" as const,
    paymentStatus: "UNPAID" as const,
    depositAmount: null,
    depositPaidAt: null,
  };

  test("확정됐고 선수금을 안 냈으면 선수금 대기다", () => {
    expect(toPaymentStage({ ...base, estimateStatus: "CONFIRMED", depositAmount: 18000 })).toBe(
      "DEPOSIT_DUE"
    );
  });

  test("선수금을 낸 확정 견적은 이사 전이라 결제할 단계가 아니다", () => {
    expect(
      toPaymentStage({
        ...base,
        estimateStatus: "CONFIRMED",
        depositAmount: 18000,
        depositPaidAt: new Date(),
      })
    ).toBe("NONE");
  });

  test("이사가 끝나고 선수금을 냈으면 잔금 대기다", () => {
    expect(
      toPaymentStage({
        ...base,
        estimateStatus: "COMPLETED",
        depositAmount: 18000,
        depositPaidAt: new Date(),
      })
    ).toBe("BALANCE_DUE");
  });

  test("선수금이 없는 옛 견적은 이사가 끝나면 바로 잔금 대기다", () => {
    expect(toPaymentStage({ ...base, estimateStatus: "COMPLETED" })).toBe("BALANCE_DUE");
  });

  // 선수금이 설정됐는데 못 낸 채 이사가 끝난 견적은 잔금을 받을 단계가 아니다
  test("선수금을 안 낸 채 완료된 견적은 결제할 단계가 아니다", () => {
    expect(toPaymentStage({ ...base, estimateStatus: "COMPLETED", depositAmount: 18000 })).toBe(
      "NONE"
    );
  });

  test("잔금까지 결제했으면 PAID다", () => {
    expect(toPaymentStage({ ...base, estimateStatus: "COMPLETED", paymentStatus: "PAID" })).toBe(
      "PAID"
    );
  });

  test("대기·반려 견적은 결제할 단계가 아니다", () => {
    expect(toPaymentStage(base)).toBe("NONE");
    expect(toPaymentStage({ ...base, estimateStatus: "REJECTED" })).toBe("NONE");
  });
});

describe("paymentStageWhere", () => {
  test("DUE는 선수금 대기 또는 잔금 대기다", () => {
    expect(paymentStageWhere("DUE")).toEqual({ OR: [depositDueWhere, balanceDueWhere] });
  });

  test("PAID는 잔금까지 결제한 견적이다", () => {
    expect(paymentStageWhere("PAID")).toEqual({ paymentStatus: "PAID" });
  });
});

describe("calcExtraChargeMax", () => {
  test("견적 금액의 20%다", () => {
    expect(calcExtraChargeMax(180000)).toBe(36000);
  });

  test("10원 단위로 내림한다", () => {
    // 123,456 × 20% = 24,691.2 → 24,690
    expect(calcExtraChargeMax(123456)).toBe(24690);
  });

  test("견적 금액이 없으면 0이다", () => {
    expect(calcExtraChargeMax(null)).toBe(0);
  });
});

describe("calcBalanceAmount — 추가 금액", () => {
  const base = { price: 180000, depositAmount: 18000 };

  test("승인된 추가 금액만 잔금에 합산한다", () => {
    expect(
      calcBalanceAmount({ ...base, extraCharges: [{ amount: 10000, status: "APPROVED" }] })
    ).toBe(172000);
  });

  test("요청 중이거나 거절된 추가 금액은 합산하지 않는다", () => {
    expect(
      calcBalanceAmount({ ...base, extraCharges: [{ amount: 10000, status: "PROPOSED" }] })
    ).toBe(162000);
    expect(
      calcBalanceAmount({ ...base, extraCharges: [{ amount: 10000, status: "REJECTED" }] })
    ).toBe(162000);
  });

  test("여러 건이면 승인된 건만 모두 더한다", () => {
    expect(
      calcBalanceAmount({
        ...base,
        extraCharges: [
          { amount: 10000, status: "APPROVED" },
          { amount: 5000, status: "APPROVED" },
          { amount: 7000, status: "REJECTED" },
          { amount: 3000, status: "PROPOSED" },
        ],
      })
    ).toBe(177000);
  });

  test("선수금이 없는 옛 견적도 전액에 추가 금액을 더한다", () => {
    expect(
      calcBalanceAmount({
        price: 180000,
        depositAmount: null,
        extraCharges: [{ amount: 10000, status: "APPROVED" }],
      })
    ).toBe(190000);
  });
});

describe("sumExtraCharges", () => {
  test("지정한 상태의 건만 더하고, 목록이 없으면 0이다", () => {
    const charges = [
      { amount: 10000, status: "APPROVED" as const },
      { amount: 5000, status: "PROPOSED" as const },
      { amount: 7000, status: "REJECTED" as const },
    ];
    expect(sumExtraCharges(charges, ["PROPOSED", "APPROVED"])).toBe(15000);
    expect(sumExtraCharges(undefined, ["APPROVED"])).toBe(0);
  });
});

describe("monthRange", () => {
  test("그 달 1일 0시(UTC)부터 다음 달 1일 0시 전까지다", () => {
    expect(monthRange("2026-10")).toEqual({
      gte: new Date("2026-10-01T00:00:00Z"),
      lt: new Date("2026-11-01T00:00:00Z"),
    });
  });

  test("12월은 다음 해 1월로 넘어간다", () => {
    expect(monthRange("2026-12").lt).toEqual(new Date("2027-01-01T00:00:00Z"));
  });
});

describe("kstMonthRange", () => {
  test("KST 월초 0시(= UTC 전날 15시)부터 다음 달 월초 전까지다", () => {
    expect(kstMonthRange("2026-10")).toEqual({
      gte: new Date("2026-09-30T15:00:00Z"),
      lt: new Date("2026-10-31T15:00:00Z"),
    });
  });
});
