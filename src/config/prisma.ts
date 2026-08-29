import { PrismaClient, Prisma } from "@prisma/client";
import { isProduction } from "./env";

export const prisma = new PrismaClient({
  log: isProduction ? ["error"] : ["query", "warn", "error"],
});

/** 트랜잭션 컨텍스트. service에서 tx를 주고받을 때 사용합니다. */
export type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export { Prisma };
