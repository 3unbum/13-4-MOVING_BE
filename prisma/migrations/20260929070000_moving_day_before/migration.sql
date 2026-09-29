-- 이사 전날 알림 타입. 기존 MOVING_DAY row는 그대로 당일입니다.
-- 유니크 인덱스는 다음 마이그레이션에서 만듭니다.
-- ADD VALUE와 같은 트랜잭션에서는 새 enum 리터럴을 쓸 수 없고,
-- type::text는 인덱스 조건에서 IMMUTABLE이 아니어 한 파일에 두면 생성이 실패합니다.
ALTER TYPE "notification_type" ADD VALUE 'MOVING_DAY_BEFORE';
