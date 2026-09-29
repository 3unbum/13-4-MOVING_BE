-- 같은 요청·같은 사람에게 전날/당일을 각각 1회만 보냅니다.
-- NEW_REQUEST는 지역 알림 후 지정 요청이 한 번 더 갈 수 있어 제외합니다.
-- 앞 마이그레이션에서 enum 값이 커밋된 뒤라 리터럴을 쓸 수 있습니다.
CREATE UNIQUE INDEX "notification_moving_user_request_type_key" ON "notification" ("user_id", "quotation_request_id", "type") WHERE "type" IN ('MOVING_DAY', 'MOVING_DAY_BEFORE');
