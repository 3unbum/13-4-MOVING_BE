import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { env, isTest } from "./config/env";
import { swaggerSpec } from "./config/swagger";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./common/middlewares/errorHandler";

const app = express();

// `CLIENT_URL`은 **쉼표로 여러 개**를 받습니다. 운영 도메인과 Vercel 주소를 동시에
// 허용해야 하기 때문입니다 — 도메인을 갈아끼우는 동안 한쪽이 끊기면 안 되고,
// 팀원들은 아직 `*.vercel.app` 으로 테스트합니다.
// `credentials: true` 라 와일드카드(`*`)는 못 씁니다. 반드시 목록으로 둡니다.
const allowedOrigins = env.CLIENT_URL.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (!isTest) app.use(morgan("dev"));

if (env.NODE_ENV === "development") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
