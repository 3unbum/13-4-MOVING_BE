import { prisma } from "../../src/config/prisma";

/**
 * 테스트 간 데이터 격리용 헬퍼.
 * ⚠️ 반드시 테스트 DB(.env.test)를 바라보는지 확인하고 사용하세요.
 */
export async function cleanDatabase() {
  // TODO: 스키마 확정 후 삭제 순서 작성 (FK 역순)
  // await prisma.notification.deleteMany();
  // await prisma.review.deleteMany();
  // ...
  void prisma;
}

export async function disconnect() {
  await prisma.$disconnect();
}
