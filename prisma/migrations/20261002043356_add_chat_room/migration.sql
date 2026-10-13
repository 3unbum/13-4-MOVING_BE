-- CreateTable
CREATE TABLE "chat_room" (
    "id" SERIAL NOT NULL,
    "estimate_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "mover_id" INTEGER NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_last_read_id" INTEGER,
    "mover_last_read_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_room_estimate_id_key" ON "chat_room"("estimate_id");

-- CreateIndex
CREATE INDEX "chat_room_customer_id_last_message_at_idx" ON "chat_room"("customer_id", "last_message_at");

-- CreateIndex
CREATE INDEX "chat_room_mover_id_last_message_at_idx" ON "chat_room"("mover_id", "last_message_at");

-- CreateIndex
CREATE INDEX "chat_message_room_id_id_idx" ON "chat_message"("room_id", "id");

-- AddForeignKey
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: 이미 확정(이후 완료 포함)된 견적에 채팅방 생성
INSERT INTO "chat_room" ("estimate_id", "customer_id", "mover_id")
SELECT e."id", q."user_id", e."mover_id"
FROM "estimate" e
JOIN "quotation_request" q ON q."id" = e."quotation_request_id"
WHERE e."estimate_status" IN ('CONFIRMED', 'COMPLETED');
