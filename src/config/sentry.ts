import * as Sentry from "@sentry/node";
import { env } from "./env";

/**
 * Sentry 초기화.
 *
 * ⚠️ **다른 모듈보다 먼저 불러야 합니다.** Sentry는 http·express 모듈을 패치해서
 * 요청 정보를 수집하는데, Express가 이미 로드된 뒤에 초기화하면 패치가 걸리지 않습니다.
 * `server.ts`에서 `app`을 import하기 전에 호출합니다.
 *
 * DSN이 비어 있으면 아무것도 하지 않습니다. 로컬 개발과 CI에서는 `.env`에 값이 없으므로
 * 자동으로 꺼지고, 더미 `.env`를 쓰는 CI에도 영향이 없습니다.
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,

    // 무료 플랜은 월 5,000 이벤트입니다. 성능 추적(Tracing)은 모든 요청을 기록해서
    // 할당량을 금방 소진하므로 끄고, 에러만 수집합니다.
    tracesSampleRate: 0,
  });
}

export { Sentry };
