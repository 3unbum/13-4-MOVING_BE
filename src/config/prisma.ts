import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { env, isProduction } from "./env";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: isProduction ? ["error"] : ["query", "warn", "error"],
});

/** 트랜잭션 컨텍스트. service에서 tx를 주고받을 때 사용합니다. */
export type PrismaTransaction = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;
