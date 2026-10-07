-- CreateTable
CREATE TABLE "profile_edit_verification_code" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_edit_verification_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_edit_verification_code_user_id_key" ON "profile_edit_verification_code"("user_id");

-- AddForeignKey
ALTER TABLE "profile_edit_verification_code" ADD CONSTRAINT "profile_edit_verification_code_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
