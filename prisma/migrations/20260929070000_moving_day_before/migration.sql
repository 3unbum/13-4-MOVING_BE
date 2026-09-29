-- 이사 전날 알림 타입. 기존 MOVING_DAY row는 그대로 당일입니다.
ALTER TYPE "notification_type" ADD VALUE 'MOVING_DAY_BEFORE';

-- 같은 요청·같은 사람에게 전날/당일을 각각 1회만 보냅니다.
-- NEW_REQUEST는 지역 알림 후 지정 요청이 한 번 더 갈 수 있어 제외합니다.
-- type 리터럴을 enum으로 적지 않습니다. ADD VALUE와 같은 트랜잭션에서
-- 새 enum 값을 쓰면 Postgres가 "아직 커밋되지 않은 값"으로 거절합니다.
CREATE UNIQUE INDEX "notification_moving_user_request_type_key" ON "notification" ("user_id", "quotation_request_id", "type") WHERE "type"::text LIKE 'MOVING_DAY%';
