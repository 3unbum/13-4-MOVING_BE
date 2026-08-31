<div align="center">

# 🚚 무빙 (MOVING) — Backend

**이사 소비자와 이사 전문가를 연결하는 매칭 서비스**

코드잇 스프린트 13기 · 파트4 고급 프로젝트 · 4팀

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io)

[Frontend Repository](https://github.com/3unbum/13-4-MOVING_FE)

</div>

<br />

## 📖 프로젝트 소개

이사 시장에는 무분별한 가격 책정과 무책임한 서비스로 인해 **정보의 투명성과 신뢰도가 낮은 문제**가 있습니다.

무빙은 소비자가 원하는 서비스와 주거 정보를 입력하면 이사 전문가들이 견적을 제공하고, 사용자가 이를 바탕으로 전문가를 선정할 수 있는 매칭 서비스입니다.

<br />

## 🛠 기술 스택

| 구분         | 기술                                     |
| ------------ | ---------------------------------------- |
| **Runtime**  | Node.js                                  |
| **Language** | TypeScript                               |
| **Database** | PostgreSQL                               |
| **ORM**      | Prisma                                   |
| **Auth**     | JWT · OAuth 2.0 (Google · Naver · Kakao) |

<br />

## 🗂 도메인 모델

```
User ─┬─ CustomerProfile ── customer_service
      └─ MoverProfile ───── mover_service · mover_region

QuotationRequest ─┬─ Estimate ── Review
                  └─ TargetedRequest
```

### 핵심 규칙

| 규칙              | 내용                                                         |
| ----------------- | ------------------------------------------------------------ |
| **활성 요청 1건** | 유저당 진행 중인 견적 요청은 하나만 (`PENDING` · `ASSIGNED`) |
| **견적 상한**     | 한 요청당 최대 8건 (일반 5 + 지정 3)                         |
| **지정 견적**     | 일반 요청 후에만 가능, 최대 3명                              |
| **지역 매칭**     | 기사님은 서비스 가능 지역 내 요청만 조회                     |
| **프로필 게이트** | 프로필 등록 전에는 전용 기능 접근 불가                       |

### 상태 전이

```
QuotationRequest   PENDING ──▶ ASSIGNED ──▶ COMPLETED
                      └──────────────────▶ EXPIRED

Estimate           PENDING ──▶ CONFIRMED ──▶ COMPLETED
                      └──────▶ REJECTED

Review             PENDING ──▶ CONFIRMED
```

<br />

## 🚀 시작하기

### 요구 사항

- Node.js 20 이상
- PostgreSQL 16 이상

### 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/3unbum/13-4-MOVING_BE.git
cd 13-4-MOVING_BE

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env

# 데이터베이스 마이그레이션
npx prisma migrate dev

# 시드 데이터 생성
npx prisma db seed

# 개발 서버 실행
npm run dev
```

### 환경 변수

```env
DATABASE_URL=postgresql://user:password@localhost:5432/moving
JWT_SECRET=
JWT_REFRESH_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
```

<br />

## 📡 API 개요

| 그룹        | 엔드포인트                  | 설명                            |
| ----------- | --------------------------- | ------------------------------- |
| 인증        | `/api/auth/*`               | 회원가입 · 로그인 · 소셜 · 토큰 |
| 유저        | `/api/users/me`             | 내 정보 · 기본정보 수정         |
| 프로필      | `/api/profiles/*`           | 프로필 등록 · 수정              |
| 견적 요청   | `/api/quotation-requests/*` | 요청 생성 · 조회 · 지정 견적    |
| 기사님      | `/api/movers/*`             | 목록 · 상세 · 리뷰 · 찜         |
| 견적        | `/api/estimates/*`          | 받은 견적 · 확정                |
| 기사님 전용 | `/api/mover/*`              | 받은 요청 · 견적 발송 · 반려    |
| 리뷰        | `/api/reviews/*`            | 작성 · 조회                     |
| 찜          | `/api/favorites`            | 찜 목록 · 삭제                  |

<br />

## 🔒 보안

- 비밀번호 해싱 (bcrypt)
- CORS — 프론트엔드 도메인만 허용
- 쿠키 `SameSite` 설정으로 CSRF 방지
- Prisma ORM 사용으로 SQL 인젝션 방지
- `express-rate-limit`으로 로그인 요청 제한
- 프로덕션 환경에서 내부 에러 상세 노출 차단

<br />

## 🌿 브랜치 전략

```
main        운영 배포
 └── dev    개발 통합 (기본 브랜치)
      └── feat-기능이름-이슈번호
```

- 이슈 생성 시 브랜치를 함께 생성합니다
- 작업 완료 후 `dev`로 PR을 올립니다
- **Squash and Merge**로 병합합니다

### 커밋 컨벤션

| 타입       | 설명             |
| ---------- | ---------------- |
| `feat`     | 새로운 기능 추가 |
| `fix`      | 버그 수정        |
| `chore`    | 빌드 · 설정 변경 |
| `test`     | 테스트 코드      |
| `refactor` | 코드 리팩토링    |

<br />

## 🤝 팀 규칙

- 코드 리뷰는 **24시간 내**에 완료합니다
- `dev` 브랜치 병합에는 **승인 2명**이 필요합니다
- 4시간 동안 해결되지 않는 문제는 팀에 공유합니다
- 데일리 스크럼은 전날 퇴실 전 최신화합니다

<br />

## 👥 팀원

| 이름   | 역할               |
| ------ | ------------------ |
| 이은범 | 팀장 · 견적 / 랜딩 |
| 송현규 | 견적 / 랜딩        |
| 김민수 | 회원 / 프로필      |
| 조서현 | 회원 / 프로필      |
| 문치호 | 기사님 찾기 / 리뷰 |
| 김은진 | 기사님 찾기 / 리뷰 |

<div align="center">
<br />

**코드잇 스프린트 13기 파트4 · 4팀**

</div>
