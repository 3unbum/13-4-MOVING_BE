import bcrypt from "bcrypt";
import { prisma } from "../src/config/prisma";

/**
 * 개발용 시드 데이터.
 *
 * 실행: npm run prisma:seed
 * 전부 지우고 다시 넣습니다. 난수는 고정 시드라 같은 날 재실행하면 같은 결과입니다.
 * 단 movingDate는 "오늘 기준 ±N일"로 잡으므로 실행일이 바뀌면 날짜도 함께 밀립니다
 * (이사 시나리오가 항상 현재 기준으로 유효해야 하므로 의도한 동작입니다).
 *
 * 계정 비밀번호는 전부 `test1234!` 입니다.
 *
 * ── 구성 ─────────────────────────────────────────────────────
 *   고정 계정 5명   — 기존 시드 그대로. 팀원들이 쓰던 계정이라 유지합니다.
 *                     customer@ / newbie@(프로필 미등록) / mover1~3@
 *   대량 계정       — 일반 유저 20명(user01~20@moving.test)
 *                     기사님 40명(mover01~40@moving.test)
 *   견적 요청       — 요청 있는 일반 유저 17명 각 1건 + 고정 계정 2건 = 19건
 *
 * ── 일반 유저 20명의 상태 분포 ───────────────────────────────
 *   user01~03  요청 없음        빈 화면 / "견적 요청하러 가기" CTA
 *   user04~11  PENDING          견적 대기 — 받은 견적 3~5건
 *   user12~15  ASSIGNED         확정됨, 이사 전
 *   user16~17  COMPLETED        이사 완료 + 리뷰 미작성(작성 가능한 리뷰)
 *   user18~20  COMPLETED        이사 완료 + 리뷰 작성 완료(내가 작성한 리뷰)
 *
 * ── 기사님 40명 ──────────────────────────────────────────────
 *   경력 1~20년, 평점 3.0~5.0, 리뷰/확정/찜 수를 흩어놓아 정렬·필터를 볼 수 있게 합니다.
 *   지역·서비스도 고르게 섞여 있어 필터 조합이 비지 않습니다.
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
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("운영 환경에서는 시드를 실행할 수 없습니다.");
  }

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

  await seedBulk(password, [mover1.id, mover2.id, mover3.id]);

  const [users, requests, estimates, reviews] = await Promise.all([
    prisma.user.count(),
    prisma.quotationRequest.count(),
    prisma.estimate.count(),
    prisma.review.count(),
  ]);

  console.log("시드 데이터 생성 완료");
  console.log(
    `  유저 ${users}명 / 견적요청 ${requests}건 / 견적 ${estimates}건 / 리뷰 ${reviews}건`
  );
  console.log(`  비밀번호는 전부 ${PASSWORD}`);
  console.log("  고정   customer@moving.test / newbie@moving.test(프로필 미등록) / mover1~3@");
  console.log("  대량   user01~20@moving.test / mover01~40@moving.test");
}

// ─────────────────────────── 대량 시드 ───────────────────────────

/** 재실행해도 같은 데이터가 나오도록 고정 시드 난수를 씁니다. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const REGIONS = [
  "SEOUL",
  "GYEONGGI",
  "INCHEON",
  "GANGWON",
  "CHUNGBUK",
  "CHUNGNAM",
  "SEJONG",
  "DAEJEON",
  "JEONBUK",
  "JEONNAM",
  "GWANGJU",
  "GYEONGBUK",
  "GYEONGNAM",
  "DAEGU",
  "ULSAN",
  "BUSAN",
  "JEJU",
] as const;
const SERVICES = ["SMALL", "HOME", "OFFICE"] as const;

/** 지역별 대표 주소 — from/to를 그럴듯하게 채우기 위한 표본 */
const ADDRESS_BY_REGION: Record<string, { postal: string; address: string }> = {
  SEOUL: { postal: "06234", address: "서울 강남구 테헤란로 123" },
  GYEONGGI: { postal: "13529", address: "경기 성남시 분당구 판교역로 235" },
  INCHEON: { postal: "21554", address: "인천 남동구 정각로 29" },
  GANGWON: { postal: "24266", address: "강원 춘천시 중앙로 1" },
  CHUNGBUK: { postal: "28644", address: "충북 청주시 상당구 상당로 82" },
  CHUNGNAM: { postal: "31119", address: "충남 천안시 서북구 번영로 156" },
  SEJONG: { postal: "30151", address: "세종 한누리대로 2130" },
  DAEJEON: { postal: "35242", address: "대전 서구 둔산로 100" },
  JEONBUK: { postal: "54968", address: "전북 전주시 완산구 노송광장로 10" },
  JEONNAM: { postal: "58564", address: "전남 무안군 삼향읍 오룡길 1" },
  GWANGJU: { postal: "61945", address: "광주 서구 내방로 111" },
  GYEONGBUK: { postal: "36759", address: "경북 안동시 풍천면 도청대로 455" },
  GYEONGNAM: { postal: "51154", address: "경남 창원시 의창구 중앙대로 300" },
  DAEGU: { postal: "41911", address: "대구 중구 공평로 88" },
  ULSAN: { postal: "44675", address: "울산 남구 중앙로 201" },
  BUSAN: { postal: "47545", address: "부산 연제구 중앙대로 1001" },
  JEJU: { postal: "63122", address: "제주 제주시 문연로 6" },
};

const MOVER_SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"];
const MOVER_TITLES = [
  "안전제일 이사",
  "친절한 반장",
  "꼼꼼한 포장",
  "믿음직한 손길",
  "빠른 이사",
  "정직한 견적",
  "베테랑 기사",
  "깔끔한 마무리",
  "합리적인 이사",
  "소문난 이사왕",
];
const CUSTOMER_NAMES = [
  "김민준",
  "이서연",
  "박도윤",
  "최지우",
  "정하준",
  "강서윤",
  "조예준",
  "윤지호",
  "장수아",
  "임건우",
  "한지안",
  "오시우",
  "서하윤",
  "신준호",
  "권유나",
  "황시윤",
  "안채원",
  "송재원",
  "전민서",
  "홍다은",
];

/**
 * 대량 데이터를 넣습니다. 고정 계정(customer/newbie/mover1~3)은 건드리지 않고
 * 그 위에 얹습니다 — 팀원들이 쓰던 계정이 그대로 살아 있어야 하기 때문입니다.
 */
async function seedBulk(password: string, fixedMoverIds: number[]) {
  const rand = makeRandom(20260914);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
  const pickInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  // ── 기사님 40명 ────────────────────────────────────────────
  const moverIds: number[] = [];
  for (let i = 1; i <= 40; i++) {
    const no = String(i).padStart(2, "0");
    const career = pickInt(1, 20);
    // 평점 3.0~5.0. 리뷰가 0건이면 평점도 0으로 둬서 "아직 리뷰 없음"을 표현합니다.
    const reviewCount = i <= 4 ? 0 : pickInt(1, 120);
    const avgRating = reviewCount === 0 ? 0 : Math.round((3 + rand() * 2) * 10) / 10;

    // 지역 1~4개, 서비스 1~3개 — 필터 조합이 비지 않도록 고르게 섞습니다
    const regions = [
      ...new Set([pick(REGIONS), pick(REGIONS), pick(REGIONS), pick(REGIONS)]),
    ].slice(0, pickInt(1, 4));
    const services = [...new Set([pick(SERVICES), pick(SERVICES), pick(SERVICES)])].slice(
      0,
      pickInt(1, 3)
    );

    const mover = await prisma.user.create({
      data: {
        role: "MOVER",
        name: `${pick(MOVER_SURNAMES)}기사`,
        email: `mover${no}@moving.test`,
        phoneNumber: `010${String(20000000 + i).padStart(8, "0")}`,
        password,
        provider: "LOCAL",
        moverProfile: {
          create: {
            nickName: `${pick(MOVER_TITLES)} ${no}호`,
            career,
            bio: `${career}년 경력, 고객 만족을 최우선으로 생각합니다`,
            description:
              `${career}년간 현장에서 쌓은 경험으로 안전하게 모시겠습니다. ` +
              `포장부터 정리까지 꼼꼼하게 책임집니다.`,
            avgRating,
            reviewCount,
            confirmedCount: pickInt(0, 80),
          },
        },
        moverRegions: { create: regions.map((region) => ({ region })) },
        moverServices: { create: services.map((service) => ({ service })) },
      },
    });
    moverIds.push(mover.id);
  }

  const allMoverIds = [...fixedMoverIds, ...moverIds];

  // ── 일반 유저 20명 + 상태별 견적 시나리오 ──────────────────
  for (let i = 1; i <= 20; i++) {
    const no = String(i).padStart(2, "0");
    const customer = await prisma.user.create({
      data: {
        role: "CUSTOMER",
        name: CUSTOMER_NAMES[i - 1]!,
        email: `user${no}@moving.test`,
        phoneNumber: `010${String(10000000 + i).padStart(8, "0")}`,
        password,
        provider: "LOCAL",
        customerProfile: { create: { region: pick(REGIONS) } },
        customerServices: { create: [{ service: pick(SERVICES) }] },
      },
    });

    // 찜 2~5명 — 찜한 기사님 페이지용
    const favoriteTargets = [
      ...new Set(Array.from({ length: pickInt(2, 5) }, () => pick(allMoverIds))),
    ];
    await prisma.favorite.createMany({
      data: favoriteTargets.map((moverId) => ({ userId: customer.id, moverId })),
    });

    // user01~03은 요청 없음 — 빈 상태 화면 확인용
    if (i <= 3) continue;

    const status = i <= 11 ? "PENDING" : i <= 15 ? "ASSIGNED" : ("COMPLETED" as const);
    // 이사일: 대기/확정은 미래, 완료는 과거
    const movingDate =
      status === "COMPLETED" ? daysFromToday(-pickInt(3, 40)) : daysFromToday(pickInt(3, 45));

    const fromRegion = pick(REGIONS);
    const toRegion = pick(REGIONS);
    const from = ADDRESS_BY_REGION[fromRegion]!;
    const to = ADDRESS_BY_REGION[toRegion]!;

    const request = await prisma.quotationRequest.create({
      data: {
        userId: customer.id,
        category: pick(SERVICES),
        movingDate,
        quotationStatus: status,
        fromPostalCode: from.postal,
        fromRegion,
        fromAddress: from.address,
        fromDetailAddress: `${pickInt(1, 30)}동 ${pickInt(101, 2504)}호`,
        toPostalCode: to.postal,
        toRegion,
        toAddress: to.address,
        toDetailAddress: `${pickInt(1, 30)}동 ${pickInt(101, 2504)}호`,
      },
    });

    // 지정 견적 요청 — 일부 요청에만 최대 3명 (앱 레벨 상한)
    const targeted = [
      ...new Set(Array.from({ length: pickInt(0, 3) }, () => pick(allMoverIds))),
    ].slice(0, 3);
    if (targeted.length > 0) {
      await prisma.targetedRequest.createMany({
        data: targeted.map((moverId) => ({ quotationRequestId: request.id, moverId })),
      });
    }

    // 견적 3~5건 — 지정 기사님을 먼저 넣고 나머지를 채웁니다
    const estimateMovers = [
      ...new Set([...targeted, ...Array.from({ length: pickInt(3, 5) }, () => pick(allMoverIds))]),
    ].slice(0, 5);

    // 확정/완료 요청은 첫 번째 기사님이 낙점된 것으로 둡니다
    const winnerId = estimateMovers[0]!;

    for (const moverId of estimateMovers) {
      const isWinner = moverId === winnerId;
      // 반려 견적도 섞어서 "반려 요청" 화면을 볼 수 있게 합니다
      const rejected = !isWinner && rand() < 0.2;

      const estimateStatus = rejected
        ? "REJECTED"
        : status === "COMPLETED"
          ? isWinner
            ? "COMPLETED"
            : "REJECTED"
          : status === "ASSIGNED"
            ? isWinner
              ? "CONFIRMED"
              : "PENDING"
            : ("PENDING" as const);

      const estimate = await prisma.estimate.create({
        data: {
          quotationRequestId: request.id,
          moverId,
          price: estimateStatus === "REJECTED" ? null : pickInt(15, 180) * 10_000,
          comment:
            estimateStatus === "REJECTED"
              ? "해당 날짜에 이미 예약이 차 있어 어렵습니다."
              : "요청하신 일정에 맞춰 진행 가능합니다. 포장 자재 포함 가격입니다.",
          estimateStatus,
        },
      });

      // 이사 완료 → 리뷰 row 생성 (배치가 하는 일)
      if (estimateStatus === "COMPLETED") {
        const written = i >= 18; // user18~20만 리뷰 작성 완료
        await prisma.review.create({
          data: {
            estimateId: estimate.id,
            customerId: customer.id,
            status: written ? "CONFIRMED" : "PENDING",
            rating: written ? pickInt(3, 5) : null,
            comment: written
              ? "시간 약속 잘 지켜주시고 짐도 꼼꼼하게 포장해주셨어요. 감사합니다!"
              : null,
          },
        });
      }
    }
  }

  // 찜 카운트를 실제 row 수와 맞춥니다 — 위에서 임의값을 넣었으므로 재계산합니다.
  // groupBy는 찜이 1건 이상인 기사님만 돌려주므로, 0건인 기사님까지 덮으려면
  // 전체를 0으로 초기화한 뒤 실제 수를 올려줘야 합니다.
  await prisma.moverProfile.updateMany({ data: { favoriteCount: 0 } });

  const favoriteCounts = await prisma.favorite.groupBy({
    by: ["moverId"],
    _count: { moverId: true },
  });
  for (const { moverId, _count } of favoriteCounts) {
    await prisma.moverProfile.updateMany({
      where: { userId: moverId },
      data: { favoriteCount: _count.moverId },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
