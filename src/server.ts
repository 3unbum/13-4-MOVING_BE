import app from "./app";
import { env } from "./config/env";
import { scheduleExpireRequests } from "./jobs/expireRequests.job";
import { scheduleMovingDayNotify } from "./jobs/movingDayNotify.job";
import { scheduleMoverCareerIncrement } from "./jobs/moverCareerIncrement.job";

app.listen(env.PORT, () => {
  console.log(`서버 실행 중 — http://localhost:${env.PORT}`);
  if (env.NODE_ENV === "development") {
    console.log(`swagger-jsdoc - http://localhost:${env.PORT}/api-docs`);
  }
  scheduleExpireRequests();
  scheduleMovingDayNotify();
  scheduleMoverCareerIncrement();
});
