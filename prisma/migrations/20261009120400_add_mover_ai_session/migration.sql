-- CreateTable
CREATE TABLE "mover_ai_session" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "region" "region_type",
    "service" "service_type",
    "sort" TEXT,
    "cursor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mover_ai_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mover_ai_message" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mover_ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mover_ai_session_user_id_updated_at_idx" ON "mover_ai_session"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "mover_ai_message_session_id_created_at_idx" ON "mover_ai_message"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "mover_ai_session" ADD CONSTRAINT "mover_ai_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mover_ai_message" ADD CONSTRAINT "mover_ai_message_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mover_ai_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
