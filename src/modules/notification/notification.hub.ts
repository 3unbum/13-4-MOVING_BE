import type { Response } from "express";
import type { NotificationItem } from "./notification.type";

interface Listener {
  res: Response;
  heartbeat: NodeJS.Timeout;
}

const listeners = new Map<number, Set<Listener>>();

/**
 * 유저별 SSE 연결을 메모리에 유지합니다.
 */
export function addListener(userId: number, res: Response): void {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  /**
   * nginx는 버퍼링되면 이벤트가 묶여 나가기 때문에 SSE처럼 조금씩 자주 보내는 응답에선 버퍼링을 비활성화하도록 판단.
   */
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write("retry: 3000\n\n");
  res.write(": connected\n\n");

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30_000);
  heartbeat.unref();

  const listener: Listener = { res, heartbeat };
  const set = listeners.get(userId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(userId, set);

  const remove = () => {
    clearInterval(heartbeat);
    set.delete(listener);
    if (set.size === 0) listeners.delete(userId);
  };

  res.on("close", remove);
}

export function publishNotification(userId: number, item: NotificationItem): void {
  const set = listeners.get(userId);
  if (!set) return;

  const payload = `event: notification\ndata: ${JSON.stringify(item)}\n\n`;
  for (const { res } of set) {
    res.write(payload);
  }
}

/** 테스트에서 열린 연결을 정리할 때 사용합니다 */
export function closeAllListeners(): void {
  for (const set of listeners.values()) {
    for (const listener of set) {
      clearInterval(listener.heartbeat);
    }
  }
  listeners.clear();
}
