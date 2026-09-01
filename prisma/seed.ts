import bcrypt from "bcrypt";
import { prisma } from "../src/config/prisma";

/**
 * 개발용 시드 데이터.
 *
 * 실행: npm run prisma:seed
 * 여러 번 실행해도 같은 결과가 되도록 전부 지우고 다시 넣습니다.
 *
 * 계정 비밀번호는 전부 `test1234!` 입니다.
 */

const PASSWORD = "test1234!";

/** 시나리오 기준일. moving_date를 상대적으로 잡습니다. */
const today = new Date();

function daysFromToday(days: number): Date {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** 자식 → 부모 순서로 지웁니다. */
async function clean() {
  await prisma.notification.deleteMany();
  await prisma.review.deleteMany();
  await prisma.estimate.deleteMany();
  await prisma.targetedRequest.deleteMany();
  await prisma.quotationRequest.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.moverRegion.deleteMany();
  await prisma.moverService.deleteMany();
  await prisma.customerService.deleteMany();
  await prisma.moverProfile.deleteMany();
  await prisma.customerProfile.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log("시드 데이터 생성 시작");

  await clean();

  const password = await bcrypt.hash(PASSWORD, 10);

  // ── 일반 유저 2명 ──────────────────────────────────────────
  const customer = await prisma.user.create({
    data: {
      role: "CUSTOMER",
      name: "김소비",
      email: "customer@moving.test",
      phoneNumber: "01011112222",
      password,
      provider: "LOCAL",
      customerProfile: { create: { region: "SEOUL" } },
      customerServices: { create: [{ service: "HOME" }, { service: "SMALL" }] },
    },
  });

  // 프로필 미등록 유저 — 프로필 강제 미들웨어 테스트용
  const newbie = await prisma.user.create({
    data: {
      role: "CUSTOMER",
      name: "박신규",
      email: "newbie@moving.test",
      phoneNumber: "01033334444",
      password,
      provider: "LOCAL",
    },
  });

  // ── 기사님 3명 ────────────────────────────────────────────
  const movers = await Promise.all(
    [
      {
        name: "이기사",
        email: "mover1@moving.test",
        phoneNumber: "01055556666",
        nickName: "믿음직한 이사왕",
        career: 7,
        bio: "고객 만족을 최우선으로 생각합니다",
        description:
          "7년간 1,000건 이상의 이사를 진행했습니다. 파손 없는 안전한 이사를 약속드립니다.",
        avgRating: 4.5,
        regions: ["SEOUL", "GYEONGGI"] as const,
        services: ["HOME", "SMALL"] as const,
      },
      {
        name: "최기사",
        email: "mover2@moving.test",
        phoneNumber: "01077778888",
        nickName: "친절한 최반장",
        career: 3,
        bio: "합리적인 가격, 확실한 서비스",
        description: "소형이사 전문입니다. 원룸·투룸 이사는 저에게 맡겨주세요.",
        avgRating: 4.2,
        regions: ["SEOUL", "INCHEON"] as const,
        services: ["SMALL"] as const,
      },
      {
        name: "정기사",
        email: "mover3@moving.test",
        phoneNumber: "01099990000",
        nickName: "사무실이사 장인",
        career: 12,
        bio: "대형 사무실 이전 전문",
        description: "12년 경력으로 기업 이전을 안전하게 처리합니다. 주말 작업도 가능합니다.",
        avgRating: 4.8,
        regions: ["SEOUL", "GYEONGGI", "BUSAN"] as const,
        services: ["OFFICE", "HOME"] as const,
      },
    ].map(({ regions, services, nickName, career, bio, description, avgRating, ...user }) =>
      prisma.user.create({
        data: {
          ...user,
          role: "MOVER",
          password,
          provider: "LOCAL",
          moverProfile: { create: { nickName, career, bio, description, avgRating } },
          moverRegions: { create: regions.map((region) => ({ region })) },
          moverServices: { create: services.map((service) => ({ service })) },
        },
      })
    )
  );

  const [mover1, mover2, mover3] = movers as [
    (typeof movers)[0],
    (typeof movers)[0],
    (typeof movers)[0],
  ];

  // ── 찜 ────────────────────────────────────────────────────
  await prisma.favorite.createMany({
    data: [
      { userId: customer.id, moverId: mover1.id },
      { userId: customer.id, moverId: mover3.id },
    ],
  });

  // 반정규화 컬럼 동기화 — 찜을 넣었으면 카운트도 맞춰줍니다
  await prisma.moverProfile.updateMany({
    where: { userId: { in: [mover1.id, mover3.id] } },
    data: { favoriteCount: { increment: 1 } },
  });

  // ── 시나리오 1: 견적 대기 중인 활성 요청 (지정 2명) ────────
  const pendingRequest = await prisma.quotationRequest.create({
    data: {
      userId: customer.id,
      category: "HOME",
      movingDate: daysFromToday(14),
      quotationStatus: "PENDING",
      fromPostalCode: "06234",
      fromRegion: "SEOUL",
      fromAddress: "서울 강남구 테헤란로 123",
      fromDetailAddress: "101동 1001호",
      toPostalCode: "13529",
      toRegion: "GYEONGGI",
      toAddress: "경기 성남시 분당구 판교역로 235",
      toDetailAddress: "202동 2002호",
      targetedRequests: {
        create: [{ moverId: mover1.id }, { moverId: mover2.id }],
      },
    },
  });

  // 지정한 2명 중 1명만 견적 발송, 1명은 반려
  await prisma.estimate.createMany({
    data: [
      {
        quotationRequestId: pendingRequest.id,
        moverId: mover1.id,
        price: 850_000,
        comment: "말씀해주신 일정에 맞춰 진행 가능합니다.",
        estimateStatus: "PENDING",
      },
      {
        quotationRequestId: pendingRequest.id,
        moverId: mover2.id,
        price: null,
        comment: "해당 날짜에 이미 예약이 차 있어 어렵습니다.",
        estimateStatus: "REJECTED",
      },
      // 지정하지 않았지만 일반 요청을 보고 보낸 견적
      {
        quotationRequestId: pendingRequest.id,
        moverId: mover3.id,
        price: 920_000,
        comment: "포장 자재 포함 가격입니다.",
        estimateStatus: "PENDING",
      },
    ],
  });

  // ── 시나리오 2: 이사 완료 + 리뷰 작성 대기 ─────────────────
  const completedRequest = await prisma.quotationRequest.create({
    data: {
      userId: newbie.id,
      category: "SMALL",
      movingDate: daysFromToday(-7),
      quotationStatus: "COMPLETED",
      fromPostalCode: "04524",
      fromRegion: "SEOUL",
      fromAddress: "서울 중구 세종대로 110",
      fromDetailAddress: "5층",
      toPostalCode: "21554",
      toRegion: "INCHEON",
      toAddress: "인천 남동구 정각로 29",
      toDetailAddress: "3층 301호",
    },
  });

  const completedEstimate = await prisma.estimate.create({
    data: {
      quotationRequestId: completedRequest.id,
      moverId: mover2.id,
      price: 430_000,
      comment: "원룸 이사 기준입니다.",
      estimateStatus: "COMPLETED",
    },
  });

  // 배치가 만들어 주는 "작성 가능한 리뷰"
  await prisma.review.create({
    data: {
      estimateId: completedEstimate.id,
      customerId: newbie.id,
      status: "PENDING",
    },
  });

  await prisma.moverProfile.update({
    where: { userId: mover2.id },
    data: { confirmedCount: { increment: 1 } },
  });

  console.log("시드 데이터 생성 완료");
  console.log(`  유저 ${2 + movers.length}명 (비밀번호: ${PASSWORD})`);
  console.log("  일반   customer@moving.test / newbie@moving.test(프로필 미등록)");
  console.log("  기사님 mover1~3@moving.test");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
