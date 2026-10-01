/**
 * Sentry 초기화 전용 진입점.
 *
 * ⚠️ **이 파일을 `server.ts`에 합치지 마세요.**
 * ES 모듈의 `import`는 호이스팅되므로, 같은 파일 안에서 `initSentry()`를 위에 적어도
 * `import app from "./app"`이 **먼저** 실행됩니다. 그러면 Express가 이미 로드된 뒤라
 * Sentry가 http·express 모듈을 패치하지 못합니다.
 *
 * 별도 파일로 분리해 `server.ts`의 **첫 번째 import**로 두면, 이 모듈이 통째로
 * 평가된 뒤에 다음 import가 진행되므로 순서가 보장됩니다.
 */
import { initSentry } from "./config/sentry";

initSentry();
