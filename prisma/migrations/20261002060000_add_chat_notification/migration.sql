-- 채팅 메시지 알림.
-- ADD VALUE와 같은 트랜잭션에서는 새 enum 리터럴을 쓸 수 없어, 아래 인덱스 조건에는 enum 값을 쓰지 않고
-- chat_room_id가 있는 행(= 채팅 알림)으로 구분합니다.
ALTER TYPE "notification_type" ADD VALUE 'NEW_CHAT_MESSAGE';

-- AlterTable
ALTER TABLE "notification" ADD COLUMN "chat_room_id" INTEGER;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 받는 사람 x 방당 알림 1건. 새 메시지가 오면 INSERT ... ON CONFLICT로 같은 행을 갱신합니다.
CREATE UNIQUE INDEX "notification_chat_user_room_key" ON "notification" ("user_id", "chat_room_id") WHERE "chat_room_id" IS NOT NULL;
