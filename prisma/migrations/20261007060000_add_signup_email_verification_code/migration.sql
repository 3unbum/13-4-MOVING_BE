-- CreateTable
CREATE TABLE "signup_email_verification_code" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_email_verification_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signup_email_verification_code_email_role_key" ON "signup_email_verification_code"("email", "role");
