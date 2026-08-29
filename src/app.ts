import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { env, isTest } from "./config/env";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./common/middlewares/errorHandler";

const app = express();

app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (!isTest) app.use(morgan("dev"));

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
