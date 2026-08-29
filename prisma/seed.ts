import { prisma } from "../src/config/prisma";

/**
 * 개발용 시드 데이터.
 *
 * 실행: npm run prisma:seed
 *
 * TODO: 스키마 작성 후 아래를 구현하세요.
 *   - 테스트용 일반 유저 / 기사님 계정
 *   - 기사님 프로필 (지역·서비스 포함)
 *   - 견적 요청 및 견적 샘플
 */
async function main() {
  console.log("시드 데이터 생성 시작");

  // TODO: 구현

  console.log("시드 데이터 생성 완료");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
