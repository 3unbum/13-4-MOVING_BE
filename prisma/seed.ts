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
 *                     과거 이사 이력 고객 12명(reviewer01~12@moving.test)
 *   견적 요청       — 요청 있는 일반 유저 17명 각 1건 + 고정 계정 2건 = 19건
 *                     + 기사님 리뷰용 과거 완료 이력 다수
 *
 * ── 일반 유저 20명의 상태 분포 ───────────────────────────────
 *   user01~03  요청 없음        빈 화면 / "견적 요청하러 가기" CTA
 *   user04~11  PENDING          견적 대기 — 받은 견적 3~5건
 *   user12~15  ASSIGNED         확정됨, 이사 전
 *   user16~17  COMPLETED        이사 완료 + 리뷰 미작성(작성 가능한 리뷰)
 *   user18~20  COMPLETED        이사 완료 + 리뷰 작성 완료(내가 작성한 리뷰)
 *
 * ── 기사님 40명 ──────────────────────────────────────────────
 *   경력·지역·서비스를 흩어놓아 정렬·필터를 볼 수 있게 합니다.
 *
 *   ⚠️ 평점·리뷰수·찜수·확정수는 **여기서 값을 넣지 않습니다.**
 *   시드 마지막에 `syncAggregates()`가 실제 row를 세어 채웁니다.
 *   예전에는 난수를 직접 박아 넣었는데, 기사님 찾기에는 "리뷰 120건"이라 떠 있고
 *   상세를 열면 리뷰가 하나도 없는 상태가 됐습니다(1차 QA에서 지적).
 *
 *   리뷰는 `seedReviewHistory()`가 만드는 과거 완료 이력에서 나옵니다.
 *   앞쪽 기사님일수록 이력이 많아, 첫 번째 기사님은 리뷰가 24건이라
 *   목록 페이지네이션("더 보기")까지 확인할 수 있습니다.
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
      // avgRating은 구조분해로 빼내기만 하고 쓰지 않습니다 — user에 섞이면 안 되고,
      // 실제 평점은 마지막에 `syncAggregates`가 리뷰를 세어 채웁니다.
    ].map(({ regions, services, nickName, career, bio, description, avgRating: _, ...user }) =>
      prisma.user.create({
        data: {
          ...user,
          role: "MOVER",
          password,
          provider: "LOCAL",
          moverProfile: { create: { nickName, career, bio, description } },
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

  // favoriteCount는 여기서 올리지 않습니다 — 마지막에 `syncAggregates`가
  // 실제 favorite row를 세어 한 번에 맞춥니다.

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

  // confirmedCount도 `syncAggregates`가 실제 견적을 세어 채웁니다.

  await seedBulk(password, [mover1.id, mover2.id, mover3.id]);

  const [users, requests, estimates, reviews, writtenReviews] = await Promise.all([
    prisma.user.count(),
    prisma.quotationRequest.count(),
    prisma.estimate.count(),
    prisma.review.count(),
    prisma.review.count({ where: { status: "CONFIRMED" } }),
  ]);

  // 집계 컬럼이 실제 row와 맞는지 바로 보이도록 최다 리뷰 기사님을 같이 찍습니다
  const top = await prisma.moverProfile.findFirst({
    orderBy: { reviewCount: "desc" },
    select: { nickName: true, reviewCount: true, avgRating: true },
  });

  console.log("시드 데이터 생성 완료");
  console.log(
    `  유저 ${users}명 / 견적요청 ${requests}건 / 견적 ${estimates}건 / ` +
      `리뷰 ${reviews}건(작성완료 ${writtenReviews}건)`
  );
  if (top) {
    console.log(`  최다 리뷰  ${top.nickName} — ${top.reviewCount}건 / 평점 ${top.avgRating}`);
  }
  console.log(`  비밀번호는 전부 ${PASSWORD}`);
  console.log("  고정   customer@moving.test / newbie@moving.test(프로필 미등록) / mover1~3@");
  console.log("  대량   user01~20@moving.test / mover01~40@moving.test");
  console.log("  리뷰용 reviewer01~12@moving.test (과거 이사 이력 보유)");
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

// 대량 시드 전체가 같은 난수열을 공유합니다 — seedBulk와 seedReviewHistory가
// 함께 쓰므로 모듈 스코프에 둡니다(함수 안에 두면 다른 함수에서 못 씁니다).
const rand = makeRandom(20260914);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
const pickInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

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
/** 과거 이사 이력 고객(reviewer01~12)의 이름 — CUSTOMER_NAMES는 20명 고정이라 따로 둡니다 */
const CUSTOMER_SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오"];
const CUSTOMER_GIVEN_NAMES = [
  "지훈",
  "수빈",
  "현우",
  "예린",
  "민석",
  "가은",
  "태윤",
  "소율",
  "동현",
  "나은",
  "승우",
  "하린",
];
/** 리뷰 본문 — 전부 같은 문장이면 목록이 부자연스러워 몇 가지를 섞습니다 */
const REVIEW_COMMENTS = [
  "시간 약속 잘 지켜주시고 짐도 꼼꼼하게 포장해주셨어요. 감사합니다!",
  "무거운 짐도 조심히 옮겨주셔서 파손 하나 없이 끝났습니다.",
  "견적보다 추가 비용 요구가 전혀 없어서 좋았어요. 믿고 맡길 만합니다.",
  "사다리차 작업까지 깔끔하게 마무리해주셨습니다. 다음에도 부탁드릴게요.",
  "상담부터 마무리까지 친절하셨고 정리도 도와주셔서 편했습니다.",
  "예상보다 빨리 끝났는데 마무리가 꼼꼼했습니다. 추천합니다.",
];
/** 낮은 별점(1~2점)용 — 칭찬 문구에 1점이 붙으면 화면이 어색합니다 */
const LOW_RATING_COMMENTS = [
  "도착이 한 시간 넘게 늦어서 일정이 꼬였습니다.",
  "견적에 없던 비용을 당일에 추가로 요구하셨어요.",
  "짐 몇 개에 흠집이 생겼는데 안내를 못 받았습니다.",
  "포장이 생각보다 꼼꼼하지 않아 아쉬웠습니다.",
];
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
  // ── 기사님 40명 ────────────────────────────────────────────
  const moverIds: number[] = [];
  for (let i = 1; i <= 40; i++) {
    const no = String(i).padStart(2, "0");
    const career = pickInt(1, 20);

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
            // avgRating·reviewCount·confirmedCount는 넣지 않습니다.
            // 실제 row를 세어 `syncAggregates`가 마지막에 채웁니다 —
            // 여기서 임의값을 넣으면 목록의 숫자와 상세의 실제 리뷰가 어긋납니다.
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

  console.log(`  대량 시드 완료 — 기사님 ${allMoverIds.length}명`);
  await seedReviewHistory(password, allMoverIds);
  await syncAggregates();
}

/**
 * 과거 이사 이력 — 기사님 상세의 리뷰 목록을 채웁니다.
 *
 * 위 20명 시나리오만으로는 COMPLETED 요청이 5건뿐이라 리뷰도 그만큼만 생깁니다.
 * 기사님 찾기에는 "리뷰 100건"이라 떠 있는데 상세를 열면 비어 있는 상태가 되는데,
 * 실제로 1차 QA에서 이 모순이 지적됐습니다.
 *
 * 그래서 이미 이사를 마친 고객(reviewer01~12)을 따로 두고, 기사님마다 완료된
 * 이사를 여러 건 쌓습니다. 집계 컬럼은 이 데이터를 세어서 채우므로
 * (`syncAggregates`) 목록과 상세가 항상 일치합니다.
 *
 * 상위 기사님에게 리뷰를 몰아주어 정렬·페이지네이션을 볼 수 있게 합니다.
 */
async function seedReviewHistory(password: string, allMoverIds: number[]) {
  console.log("  과거 이사 이력 생성 중...");
  const reviewers = [];
  for (let i = 1; i <= 12; i++) {
    const no = String(i).padStart(2, "0");
    reviewers.push(
      await prisma.user.create({
        data: {
          role: "CUSTOMER",
          name: `${pick(CUSTOMER_SURNAMES)}${pick(CUSTOMER_GIVEN_NAMES)}`,
          email: `reviewer${no}@moving.test`,
          phoneNumber: `010${String(30000000 + i).padStart(8, "0")}`,
          password,
          provider: "LOCAL",
          customerProfile: { create: { region: pick(REGIONS) } },
          customerServices: { create: [{ service: pick(SERVICES) }] },
        },
      })
    );
  }

  // 앞쪽 기사님일수록 이력이 많습니다 — 목록 정렬과 "더 보기"를 확인하려면
  // 한 명은 리뷰가 페이지 크기를 넘어야 합니다.
  for (const [index, moverId] of allMoverIds.entries()) {
    const count = index === 0 ? 24 : index < 5 ? pickInt(8, 16) : index < 15 ? pickInt(2, 7) : 0;

    for (let n = 0; n < count; n++) {
      const customer = reviewers[n % reviewers.length]!;
      const fromRegion = pick(REGIONS);
      const toRegion = pick(REGIONS);
      const from = ADDRESS_BY_REGION[fromRegion]!;
      const to = ADDRESS_BY_REGION[toRegion]!;

      const request = await prisma.quotationRequest.create({
        data: {
          userId: customer.id,
          category: pick(SERVICES),
          // 과거 1년에 흩어놓습니다. 같은 고객이 여러 번 이사한 이력이 됩니다
          movingDate: daysFromToday(-pickInt(30, 400)),
          quotationStatus: "COMPLETED",
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

      const estimate = await prisma.estimate.create({
        data: {
          quotationRequestId: request.id,
          moverId,
          price: pickInt(15, 180) * 10_000,
          comment: "요청하신 일정에 맞춰 진행 가능합니다. 포장 자재 포함 가격입니다.",
          estimateStatus: "COMPLETED",
        },
      });

      // 10건 중 8건만 실제로 작성합니다. 나머지는 PENDING으로 남아
      // 완료됐지만 리뷰가 없는 경우도 화면에서 볼 수 있습니다.
      const written = rand() < 0.8;
      // 6건 중 1건꼴로 낮은 별점을 섞습니다 — 전부 3점 이상이면 별점 분포 차트가
      // 위쪽만 차서 필터·정렬을 확인하기 어렵습니다.
      const isLow = written && rand() < 0.15;
      await prisma.review.create({
        data: {
          estimateId: estimate.id,
          customerId: customer.id,
          status: written ? "CONFIRMED" : "PENDING",
          rating: written ? (isLow ? pickInt(1, 2) : pickInt(3, 5)) : null,
          comment: written ? pick(isLow ? LOW_RATING_COMMENTS : REVIEW_COMMENTS) : null,
        },
      });
    }
  }
}

/**
 * 반정규화 컬럼을 실제 row 수에 맞춥니다.
 *
 * 찜·리뷰·확정 수를 시드 중간에 임의값으로 넣는 곳이 있어, 마지막에 한 번
 * 전부 다시 셉니다. groupBy는 1건 이상인 기사님만 돌려주므로 0으로 초기화한 뒤
 * 올려줘야 0건인 기사님까지 덮입니다.
 *
 * ⚠️ `moverId`라는 이름이 붙은 컬럼은 전부 **`user.id`를 가리킵니다.**
 *    (`schema.prisma`의 `mover User @relation(fields: [moverId], references: [id])`)
 *    `moverProfile.id`가 아니므로, 프로필을 갱신할 때는 항상 `where: { userId }`를
 *    써야 합니다. `where: { id }`로 쓰면 엉뚱한 기사님 수치가 바뀝니다.
 */
async function syncAggregates() {
  await prisma.moverProfile.updateMany({
    data: { favoriteCount: 0, reviewCount: 0, avgRating: 0, confirmedCount: 0 },
  });

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

  // 리뷰는 estimate를 거쳐야 기사님과 연결됩니다 (review에 moverId가 없음).
  // 작성 완료(CONFIRMED)만 세야 화면의 리뷰 목록과 숫자가 맞습니다.
  const reviews = await prisma.review.findMany({
    where: { status: "CONFIRMED" },
    select: { rating: true, estimate: { select: { moverId: true } } },
  });

  const byMover = new Map<number, number[]>();
  for (const review of reviews) {
    if (review.rating === null) continue;
    const list = byMover.get(review.estimate.moverId) ?? [];
    list.push(review.rating);
    byMover.set(review.estimate.moverId, list);
  }

  for (const [moverId, ratings] of byMover) {
    const sum = ratings.reduce((acc, rating) => acc + rating, 0);
    await prisma.moverProfile.updateMany({
      where: { userId: moverId },
      data: {
        reviewCount: ratings.length,
        // 소수 첫째 자리까지 — 화면에 "4.5"처럼 표시됩니다
        avgRating: Math.round((sum / ratings.length) * 10) / 10,
      },
    });
  }

  // 확정 건수 = 확정됐거나 이사를 마친 견적
  const confirmed = await prisma.estimate.groupBy({
    by: ["moverId"],
    where: { estimateStatus: { in: ["CONFIRMED", "COMPLETED"] } },
    _count: { moverId: true },
  });
  for (const { moverId, _count } of confirmed) {
    await prisma.moverProfile.updateMany({
      where: { userId: moverId },
      data: { confirmedCount: _count.moverId },
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
