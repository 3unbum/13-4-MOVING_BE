import { publishNotification } from "./notification.sse";
import { enqueueNotificationPublish, runAfterCommitPublish } from "./notification.publish";

jest.mock("./notification.sse", () => ({
  publishNotification: jest.fn(),
}));

const mockedPublish = jest.mocked(publishNotification);

beforeEach(() => jest.clearAllMocks());

describe("runAfterCommitPublish", () => {
  it("성공한 뒤에만 신호를 보낸다", async () => {
    const result = await runAfterCommitPublish(async () => {
      enqueueNotificationPublish([5, 6], "NEW_REQUEST");
      return "ok";
    });

    expect(result).toBe("ok");
    expect(mockedPublish).toHaveBeenCalledTimes(1);
    expect(mockedPublish).toHaveBeenCalledWith([5, 6], { type: "NEW_REQUEST" });
  });

  it("함수가 실패하면 대기열을 보내지 않는다", async () => {
    await expect(
      runAfterCommitPublish(async () => {
        enqueueNotificationPublish([5], "NEW_ESTIMATE");
        throw new Error("롤백");
      })
    ).rejects.toThrow("롤백");

    expect(mockedPublish).not.toHaveBeenCalled();
  });
});

describe("enqueueNotificationPublish", () => {
  it("대기열 밖에서는 바로 보낸다", () => {
    enqueueNotificationPublish([7], "MOVING_DAY");

    expect(mockedPublish).toHaveBeenCalledWith([7], { type: "MOVING_DAY" });
  });
});
