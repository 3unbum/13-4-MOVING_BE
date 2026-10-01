import cron from "node-cron";
import { prisma } from "../config/prisma";

/**
 * 기사님 경력 연차 자동 증가 — 매년 1/1 00:00 (KST)
 * career 상한(60년)을 넘지 않도록 LEAST로 클램프
 */
export async function incrementMoverCareer(): Promise<void> {
  const updated = await prisma.$executeRaw`
    UPDATE mover_profile
    SET career = LEAST(career + 1, 60), updated_at = now()
  `;

  console.log(`[incrementMoverCareer] 경력 +1 갱신 ${updated}건`);
}

export function scheduleMoverCareerIncrement() {
  cron.schedule("0 0 1 1 *", incrementMoverCareer, { timezone: "Asia/Seoul" });
}
