import { AsyncLocalStorage } from "node:async_hooks";
import type { NotificationItem } from "./notification.type";
import { publishNotification } from "./notification.hub";

type PendingPublish = { userId: number; item: NotificationItem };

/**
 * 트랜잭션 안에서 만든 알림을 커밋 성공 후에만 SSE로 보내기 위한 대기열.
 *
 * createNotification은 INSERT만 하고 여기로 push합니다.
 * runAfterCommitPublish로 $transaction을 감싸면, resolve(=커밋 성공) 뒤에만 publish합니다.
 * throw(=롤백)면 대기열을 버리고 푸시하지 않습니다.
 */
const pendingStore = new AsyncLocalStorage<PendingPublish[]>();

export function enqueueNotificationPublish(userId: number, item: NotificationItem): void {
  const queue = pendingStore.getStore();
  if (queue) {
    queue.push({ userId, item });
    return;
  }
  // 래퍼 없이 호출된 경우(실수 방지) — 단독 호출이면 이미 커밋된 tx일 수 있어 즉시 푸시
  publishNotification(userId, item);
}

/**
 * fn이 성공적으로 끝난 뒤에만 대기 중인 SSE를 전송합니다.
 * prisma.$transaction(...) 전체를 이 함수로 감싸세요.
 */
export async function runAfterCommitPublish<T>(fn: () => Promise<T>): Promise<T> {
  const queue: PendingPublish[] = [];
  const result = await pendingStore.run(queue, fn);
  for (const { userId, item } of queue) {
    publishNotification(userId, item);
  }
  return result;
}
