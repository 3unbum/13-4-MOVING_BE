import { ERROR_CODES } from "@/common/errors/errorCodes";
import { env } from "@/config/env";
import { confirmTossPayment, toPaymentOrderId } from "./toss-payments";

// 키 유무를 바꿔가며 쓰려고 env를 가변 객체로 목 처리한다
jest.mock("@/config/env", () => ({ env: { TOSS_SECRET_KEY: "" } }));
const mockEnv = env as { TOSS_SECRET_KEY: string };

const input = { paymentKey: "pk_test_1", orderId: "moving-estimate-1", amount: 180000 };
const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.TOSS_SECRET_KEY = "test_sk_dummy";
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("toPaymentOrderId", () => {
  test("견적 id와 결제 종류로 토스 규칙(6~64자)에 맞는 주문 번호를 만든다", () => {
    expect(toPaymentOrderId(1, "DEPOSIT")).toBe("moving-deposit-1");
    expect(toPaymentOrderId(1, "BALANCE")).toBe("moving-balance-1");
    expect(toPaymentOrderId(1, "BALANCE").length).toBeGreaterThanOrEqual(6);
  });

  // 같은 견적의 선수금과 잔금이 같은 주문 번호면 두 번째 결제가 토스에서 중복으로 거절된다
  test("선수금과 잔금의 주문 번호는 다르다", () => {
    expect(toPaymentOrderId(1, "DEPOSIT")).not.toBe(toPaymentOrderId(1, "BALANCE"));
  });
});

describe("confirmTossPayment", () => {
  test("시크릿 키가 없으면 토스를 호출하지 않는다 (로컬·CI)", async () => {
    mockEnv.TOSS_SECRET_KEY = "";

    await confirmTossPayment(input);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("Basic 인증과 Idempotency-Key로 승인 API를 호출한다", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await confirmTossPayment(input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.tosspayments.com/v1/payments/confirm");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("test_sk_dummy:").toString("base64")}`
    );
    expect(init.headers["Idempotency-Key"]).toBe("moving-estimate-1");
    expect(JSON.parse(init.body)).toEqual(input);
  });

  // pay 입력에는 우리 쪽 type이 붙어 있다 — 토스 승인 요청에는 필요한 셋만 나가야 한다
  test("승인 요청 본문에는 paymentKey·orderId·amount만 담는다", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await confirmTossPayment({ ...input, type: "DEPOSIT" } as typeof input);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input);
  });

  test("승인이 거절되면 토스가 준 사유로 PAYMENT_FAILED를 던진다", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ code: "REJECT_CARD_PAYMENT", message: "한도초과 혹은 잔액부족" }),
    });

    await expect(confirmTossPayment(input)).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.PAYMENT_FAILED,
      message: "한도초과 혹은 잔액부족",
    });
  });

  test("응답을 못 받으면(네트워크 오류·타임아웃) 일반 실패로 처리한다", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));

    await expect(confirmTossPayment(input)).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.PAYMENT_FAILED,
    });
  });
});
