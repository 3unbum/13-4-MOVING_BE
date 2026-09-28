import type { Response } from "express";
import type { NotificationItem } from "./notification.type";

interface Listener {
  res: Response;
  heartbeat: NodeJS.Timeout;
}

const listeners = new Map<number, Set<Listener>>();

/**
 * 유저별 SSE 연결을 메모리에 유지합니다.
 * write 실패·연결 종료 시 Map/heartbeat를 정리해 죽은 소켓에 쓰지 않습니다.
 */
export function addListener(userId: number, res: Response): void {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  /**
   * nginx는 버퍼링되면 이벤트가 묶여 나가기 때문에 SSE처럼 조금씩 자주 보내는 응답에선 버퍼링을 비활성화합니다.
   */
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const set = listeners.get(userId) ?? new Set<Listener>();
  listeners.set(userId, set);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    clearInterval(heartbeat);
    set.delete(listener);
    if (set.size === 0) listeners.delete(userId);
  };

  const heartbeat = setInterval(() => {
    if (!safeWrite(res, ": heartbeat\n\n")) remove();
  }, 30_000);
  heartbeat.unref();

  const listener: Listener = { res, heartbeat };
  set.add(listener);

  // close뿐 아니라 소켓 error에서도 정리 (끊긴 뒤 write와 경쟁할 때)
  res.on("close", remove);
  res.on("error", remove);

  if (!safeWrite(res, "retry: 3000\n\n") || !safeWrite(res, ": connected\n\n")) {
    remove();
  }
}

export function publishNotification(userId: number, item: NotificationItem): void {
  const set = listeners.get(userId);
  if (!set) return;

  const payload = `event: notification\ndata: ${JSON.stringify(item)}\n\n`;
  for (const listener of [...set]) {
    if (!safeWrite(listener.res, payload)) {
      clearInterval(listener.heartbeat);
      set.delete(listener);
    }
  }
  if (set.size === 0) listeners.delete(userId);
}

/**
 * 이미 닫힌 응답이면 false.
 * write가 throw 해도 삼켜서 프로세스까지 예외가 안 올라가게 합니다.
 */
function safeWrite(res: Response, chunk: string): boolean {
  if (res.writableEnded || res.destroyed) return false;
  try {
    res.write(chunk);
    return true;
  } catch {
    return false;
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
