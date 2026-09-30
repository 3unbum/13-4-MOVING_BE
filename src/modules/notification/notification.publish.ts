import { AsyncLocalStorage } from "node:async_hooks";
import type { NotificationType } from "../../../generated/prisma/enums.ts";
import { publishNotification } from "./notification.sse";

interface PendingPublish {
  userIds: number[];
  type: NotificationType;
}

/**
 * 트랜잭션 안에서 쌓은 SSE 신호를 커밋 성공 후에만 보내기 위한 대기열입니다.
 *
 * 이벤트는 종류만 담습니다. 카드 본문은 GET /notifications가 만듭니다.
 * createMany는 id를 돌려주지 않아, 수신자 목록과 type만 대기열에 넣습니다.
 */
const pendingStore = new AsyncLocalStorage<PendingPublish[]>();

export function enqueueNotificationPublish(userIds: number[], type: NotificationType): void {
  const queue = pendingStore.getStore();
  if (queue) {
    queue.push({ userIds, type });
    return;
  }
  // 래퍼 밖에서 호출되면 이미 커밋된 뒤일 수 있어 바로 보냅니다.
  publishNotification(userIds, { type });
}

/**
 * fn이 성공한 뒤에만 대기 중인 신호를 전송합니다.
 * prisma.$transaction(...) 한 번을 이 함수로 감싸세요. 재시도 루프 전체를 감싸면
 * 롤백된 시도의 신호가 다음 시도와 함께 나갑니다.
 */
export async function runAfterCommitPublish<T>(fn: () => Promise<T>): Promise<T> {
  const queue: PendingPublish[] = [];
  const result = await pendingStore.run(queue, fn);
  for (const pending of queue) {
    publishNotification(pending.userIds, { type: pending.type });
  }
  return result;
}
