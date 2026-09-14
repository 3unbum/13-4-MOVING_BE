# 개발 DB 안내 (Supabase)

> 팀 공용 개발 DB로 Supabase를 씁니다. 각자 로컬 DB를 쓰면 데이터가 달라
> "제 화면엔 기사님이 3명인데요?" 같은 상황이 생겨서, FE 연동 시작에 맞춰 전환했습니다.

| 항목     | 값                                |
| -------- | --------------------------------- |
| 프로젝트 | `moving-dev` (조직 `13-4-MOVING`) |
| 리전     | Northeast Asia (Seoul)            |
| 플랜     | Free (DB 500MB)                   |

**`.env` 값은 AWS 파라미터 스토어(ap-northeast-2)로 공유합니다.**
비밀번호·시크릿이 들어있어 레포에 넣지 않습니다.

항목 이름은 `.env`의 키와 똑같이 씁니다 — `DATABASE_URL`, `JWT_SECRET`, ...

```bash
# 하나만 받기
aws ssm get-parameter --name DATABASE_URL --with-decryption \
  --query Parameter.Value --output text

# .env 통째로 만들기 (필요한 키를 나열)
for k in PORT NODE_ENV DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET \
         JWT_EXPIRES_IN JWT_REFRESH_EXPIRES_IN \
         AWS_PUBLIC_BUCKET_NAME AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION \
         CLIENT_URL OAUTH_SIGNUP_TOKEN_SECRET OAUTH_SIGNUP_TOKEN_EXPIRES_IN \
         GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_CALLBACK_URL \
         NAVER_CLIENT_ID NAVER_CLIENT_SECRET NAVER_CALLBACK_URL \
         KAKAO_CLIENT_ID KAKAO_CLIENT_SECRET KAKAO_CALLBACK_URL; do
  v=$(aws ssm get-parameter --name "$k" --with-decryption \
        --query Parameter.Value --output text 2>/dev/null) && echo "$k=\"$v\""
done > .env
```

> `--with-decryption`이 있어야 보안 문자열이 풀립니다.
> 권한이 없다고 나오면 팀장에게 `ssm:GetParameter` 요청하세요.
> **값이 바뀌면 팀에 공지해주세요.** 각자 다시 받아야 합니다.

---

## 처음 받는 사람

`.env`의 `DATABASE_URL`을 공유받은 **pooler URL(6543)** 로 바꾸면 끝입니다.
스키마와 시드는 이미 들어가 있으니 `migrate`도 `seed`도 돌릴 필요 없습니다.

```bash
npm install
npx prisma generate   # generated/ 는 gitignore 대상이라 각자 생성
npm run dev
```

---

## URL이 두 개인 이유

| 용도                   | 포트 | 언제                                    |
| ---------------------- | ---- | --------------------------------------- |
| **Transaction pooler** | 6543 | 평소 앱 실행 — `.env`에 이걸 넣어둡니다 |
| **Session pooler**     | 5432 | `prisma migrate` 명령을 쓸 때만         |

**호스트는 둘 다 `pooler.supabase.com`으로 같고 포트만 다릅니다.**
Transaction pooler(6543)는 커넥션을 쿼리 단위로 돌려써서 DDL에 제약이 있으니,
마이그레이션할 때만 잠깐 Session pooler(5432)로 바꿔서 돌리고 되돌리세요.

---

## ⚠️ 스키마를 바꿀 때 — 반드시 읽어주세요

공용 DB라 **혼자 쓰던 때와 규칙이 다릅니다.**

### 하지 말 것

```bash
npx prisma migrate dev      # ❌ 공용 DB에 쓰지 마세요
npx prisma migrate reset    # ❌ 전체 삭제됩니다
npm run prisma:seed         # ❌ 전부 지우고 다시 넣습니다 (아래 참고)
```

`migrate dev`는 로컬 전용입니다. 공용 DB에 돌리면 남의 마이그레이션과 충돌하거나
드리프트가 감지돼 **DB를 통째로 리셋하자고 제안**합니다.

### 할 것

스키마 변경이 필요하면 **로컬에서 만들고 → 리뷰 → 머지 후 팀장이 배포**합니다.

```bash
# 1) 로컬 PostgreSQL에서 마이그레이션 파일 생성
#    (.env를 잠깐 로컬 URL로 바꿔서)
npx prisma migrate dev --name add_something

# 2) prisma/migrations/ 에 생긴 파일을 커밋 → PR

# 3) 머지 후, 팀장이 Session pooler URL(5432)로 공용 DB에 반영
npx prisma migrate deploy
```

> `migrate deploy`는 이미 적용된 마이그레이션을 건너뛰고 새 것만 적용합니다. 안전합니다.

---

## 시드 재투입

`prisma/seed.ts`는 **전부 지우고 다시 넣습니다.** 공용 DB에서 돌리면
다른 사람이 만들어둔 테스트 데이터가 사라집니다.

필요하면 **팀에 먼저 알리고** 돌려주세요.

```bash
npm run prisma:seed
```

---

## 계정 (비밀번호 전부 `test1234!`)

### 고정 계정 — 기존 테스트용

| 이메일                 | 역할   | 상태                              |
| ---------------------- | ------ | --------------------------------- |
| `customer@moving.test` | 일반   | 프로필 등록됨                     |
| `newbie@moving.test`   | 일반   | **프로필 미등록** (가드 테스트용) |
| `mover1~3@moving.test` | 기사님 | 프로필 등록됨                     |

### 대량 계정 — 화면 확인용

**일반 유저 20명** `user01~20@moving.test`

| 계정        | 상태      | 볼 수 있는 화면                    |
| ----------- | --------- | ---------------------------------- |
| `user01~03` | 요청 없음 | 빈 화면 / "견적 요청하러 가기" CTA |
| `user04~11` | PENDING   | 받은 견적 목록 (3~5건)             |
| `user12~15` | ASSIGNED  | 확정된 견적, 이사 전               |
| `user16~17` | COMPLETED | **작성 가능한 리뷰**               |
| `user18~20` | COMPLETED | **내가 작성한 리뷰**               |

**기사님 40명** `mover01~40@moving.test`
경력 1~~20년 / 평점 0~~4.9 / 리뷰 0~~120건 / 찜 1~~42건으로 흩어져 있어
정렬·필터를 전부 확인할 수 있습니다. (평점 0은 리뷰가 아직 없는 기사님 4명)

---

## 자주 나는 문제

**`Can't reach database server`**
→ pooler URL을 쓰고 있는지 확인하세요. 비밀번호에 특수문자가 있으면 URL 인코딩이 필요합니다.

**`prepared statement "s0" already exists`**
→ pooler 환경에서 나는 증상입니다. URL 끝에 `?pgbouncer=true`를 붙이세요.

**마이그레이션이 Transaction pooler(6543)에서 실패**
→ 정상입니다. 같은 호스트의 Session pooler(5432)로 바꿔서 돌리세요.
Direct(`db.<프로젝트ID>.supabase.co`)는 IPv6 전용이라 쓰지 않습니다.
