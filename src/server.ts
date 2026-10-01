// ⚠️ **반드시 첫 번째 import여야 합니다.** Sentry가 http·express 모듈을 패치해서
// 요청 정보를 수집하는데, Express(`./app`)가 먼저 로드되면 패치가 걸리지 않습니다.
// import는 호이스팅되므로 순서를 바꾸거나 `./app` 아래로 내리면 동작하지 않습니다.
import "./instrument";

import app from "./app";
import { env } from "./config/env";
import { scheduleExpireRequests } from "./jobs/expireRequests.job";
import { scheduleMovingDayNotify } from "./jobs/movingDayNotify.job";

app.listen(env.PORT, () => {
  console.log(`서버 실행 중 — http://localhost:${env.PORT}`);
  if (env.NODE_ENV === "development") {
    console.log(`swagger-jsdoc - http://localhost:${env.PORT}/api-docs`);
  }
  scheduleExpireRequests();
  scheduleMovingDayNotify();
});
