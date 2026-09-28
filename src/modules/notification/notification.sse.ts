import type { Response } from "express";
import type { NotificationType } from "../../../generated/prisma/enums.ts";

/**
 * 알림 실시간 전달 (SSE).
 *
 * ⚠️ 연결을 프로세스 메모리에 들고 있으므로 **단일 서버 전제**입니다.
 * 인스턴스를 늘리면 다른 인스턴스에 붙은 클라이언트에는 이벤트가 가지 않습니다
 * (그때는 Redis pub/sub 같은 공유 채널이 필요합니다).
 *
 * 이벤트는 "무엇이 왔다"는 신호만 담고 알림 본문은 싣지 않습니다.
 * payload 조립은 GET /notifications 한 곳에만 두어 두 경로가 어긋나지 않게 하고,
 * createMany로 만든 알림은 id를 돌려받을 수 없어 본문을 재조회할 수도 없습니다.
 * FE는 이 신호를 받으면 목록을 다시 받아가고, type으로 토스트만 즉시 띄울 수 있습니다.
 */

/** 프록시 유휴 타임아웃(보통 30~60초)보다 짧아야 연결이 끊기지 않습니다 */
const HEARTBEAT_MS = 25_000;

/** 끊겼을 때 브라우저가 재연결을 시도할 간격 */
const RETRY_MS = 5_000;

const connections = new Map<number, Set<Response>>();

export interface NotificationEvent {
  type: NotificationType;
}

/** 쓰기 실패(소켓이 이미 닫힘)는 끊어진 연결로 봅니다 */
function write(res: Response, chunk: string): boolean {
  if (res.writableEnded) return false;
  try {
    res.write(chunk);
    return true;
  } catch {
    return false;
  }
}

function detach(userId: number, res: Response) {
  const current = connections.get(userId);
  if (!current) return;
  current.delete(res);
  // 빈 Set을 남겨두면 접속했다 떠난 유저만큼 Map이 계속 자랍니다
  if (current.size === 0) connections.delete(userId);
}

/**
 * SSE 스트림을 열고 연결을 등록합니다.
 * 반환된 함수를 호출하면 heartbeat를 멈추고 연결을 정리합니다.
 */
export function openStream(userId: number, res: Response): () => void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    // no-transform이 없으면 프록시가 내용을 바꿔 이벤트 경계가 깨질 수 있습니다
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // nginx·Next rewrites가 응답을 모아두면 이벤트가 실시간으로 도착하지 않습니다
    "X-Accel-Buffering": "no",
  });

  // 주석 한 줄을 먼저 흘려보내 프록시가 헤더를 즉시 내보내게 합니다
  write(res, `retry: ${RETRY_MS}\n: connected\n\n`);

  const targets = connections.get(userId) ?? new Set<Response>();
  targets.add(res);
  connections.set(userId, targets);

  const heartbeat = setInterval(() => {
    if (!write(res, ": ping\n\n")) {
      clearInterval(heartbeat);
      detach(userId, res);
    }
  }, HEARTBEAT_MS);

  return () => {
    clearInterval(heartbeat);
    detach(userId, res);
  };
}

/**
 * 수신자들에게 알림 신호를 보냅니다.
 *
 * ⚠️ 반드시 트랜잭션이 **커밋된 뒤** 호출하세요. 트랜잭션 안에서 부르면
 * 롤백된 알림(견적 저장은 Serializable 재시도가 걸려 실제로 일어납니다)까지
 * 클라이언트에 나가고, DB를 다시 읽으면 그 알림은 없습니다.
 */
export function publishNotification(userIds: number[], event: NotificationEvent): void {
  const body = JSON.stringify(event);

  for (const userId of new Set(userIds)) {
    const targets = connections.get(userId);
    if (!targets) continue;

    for (const res of [...targets]) {
      if (!write(res, `event: notification\ndata: ${body}\n\n`)) {
        detach(userId, res);
      }
    }
  }
}

/** 테스트·헬스체크용 — 지금 붙어 있는 연결 수 */
export function countConnections(userId?: number): number {
  if (userId !== undefined) return connections.get(userId)?.size ?? 0;
  let total = 0;
  for (const targets of connections.values()) total += targets.size;
  return total;
}
