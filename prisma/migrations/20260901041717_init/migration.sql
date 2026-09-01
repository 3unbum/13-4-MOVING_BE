-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('CUSTOMER', 'MOVER');

-- CreateEnum
CREATE TYPE "social_provider" AS ENUM ('GOOGLE', 'NAVER', 'KAKAO', 'LOCAL');

-- CreateEnum
CREATE TYPE "service_type" AS ENUM ('소형이사', '가정이사', '사무실이사');

-- CreateEnum
CREATE TYPE "region_type" AS ENUM ('서울', '경기', '인천', '강원', '충북', '충남', '세종', '대전', '전북', '전남', '광주', '경북', '경남', '대구', '울산', '부산', '제주');

-- CreateEnum
CREATE TYPE "quotation_status" AS ENUM ('PENDING', 'ASSIGNED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "estimate_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('NEW_REQUEST', 'NEW_ESTIMATE', 'ESTIMATE_CONFIRMED', 'MOVING_DAY');

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "role" "user_role" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "password" TEXT,
    "provider" "social_provider",
    "provider_id" TEXT,
    "refresh_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profile" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "image" TEXT,
    "region" "region_type",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mover_profile" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "image" TEXT,
    "nick_name" TEXT NOT NULL,
    "career" INTEGER NOT NULL,
    "bio" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "avg_rating" DECIMAL(2,1) NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "confirmed_count" INTEGER NOT NULL DEFAULT 0,
    "favorite_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mover_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_service" (
    "user_id" INTEGER NOT NULL,
    "service" "service_type" NOT NULL,

    CONSTRAINT "customer_service_pkey" PRIMARY KEY ("user_id","service")
);

-- CreateTable
CREATE TABLE "mover_service" (
    "mover_id" INTEGER NOT NULL,
    "service" "service_type" NOT NULL,

    CONSTRAINT "mover_service_pkey" PRIMARY KEY ("mover_id","service")
);

-- CreateTable
CREATE TABLE "mover_region" (
    "mover_id" INTEGER NOT NULL,
    "region" "region_type" NOT NULL,

    CONSTRAINT "mover_region_pkey" PRIMARY KEY ("mover_id","region")
);

-- CreateTable
CREATE TABLE "quotation_request" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "category" "service_type" NOT NULL,
    "moving_date" DATE NOT NULL,
    "from_postal_code" TEXT NOT NULL,
    "from_region" "region_type" NOT NULL,
    "from_address" TEXT NOT NULL,
    "from_detail_address" TEXT NOT NULL,
    "to_postal_code" TEXT NOT NULL,
    "to_region" "region_type" NOT NULL,
    "to_address" TEXT NOT NULL,
    "to_detail_address" TEXT NOT NULL,
    "quotation_status" "quotation_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "targeted_request" (
    "id" SERIAL NOT NULL,
    "quotation_request_id" INTEGER NOT NULL,
    "mover_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "targeted_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate" (
    "id" SERIAL NOT NULL,
    "quotation_request_id" INTEGER NOT NULL,
    "mover_id" INTEGER NOT NULL,
    "price" INTEGER,
    "comment" TEXT,
    "estimate_status" "estimate_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" SERIAL NOT NULL,
    "estimate_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "review_status" "review_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "mover_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "estimate_id" INTEGER,
    "quotation_request_id" INTEGER,
    "type" "notification_type" NOT NULL,
    "message" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_role_email_idx" ON "user"("role", "email");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_provider_provider_id_key" ON "user"("role", "provider", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profile_user_id_key" ON "customer_profile"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mover_profile_user_id_key" ON "mover_profile"("user_id");

-- CreateIndex
CREATE INDEX "mover_profile_avg_rating_id_idx" ON "mover_profile"("avg_rating", "id");

-- CreateIndex
CREATE INDEX "mover_profile_review_count_id_idx" ON "mover_profile"("review_count", "id");

-- CreateIndex
CREATE INDEX "mover_profile_career_id_idx" ON "mover_profile"("career", "id");

-- CreateIndex
CREATE INDEX "mover_profile_confirmed_count_id_idx" ON "mover_profile"("confirmed_count", "id");

-- CreateIndex
CREATE INDEX "mover_service_service_mover_id_idx" ON "mover_service"("service", "mover_id");

-- CreateIndex
CREATE INDEX "mover_region_region_mover_id_idx" ON "mover_region"("region", "mover_id");

-- CreateIndex
CREATE INDEX "quotation_request_from_region_quotation_status_idx" ON "quotation_request"("from_region", "quotation_status");

-- CreateIndex
CREATE INDEX "quotation_request_user_id_quotation_status_idx" ON "quotation_request"("user_id", "quotation_status");

-- CreateIndex
CREATE INDEX "quotation_request_moving_date_quotation_status_idx" ON "quotation_request"("moving_date", "quotation_status");

-- CreateIndex
CREATE INDEX "targeted_request_mover_id_idx" ON "targeted_request"("mover_id");

-- CreateIndex
CREATE UNIQUE INDEX "targeted_request_quotation_request_id_mover_id_key" ON "targeted_request"("quotation_request_id", "mover_id");

-- CreateIndex
CREATE INDEX "estimate_mover_id_estimate_status_idx" ON "estimate"("mover_id", "estimate_status");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_quotation_request_id_mover_id_key" ON "estimate"("quotation_request_id", "mover_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_estimate_id_key" ON "review"("estimate_id");

-- CreateIndex
CREATE INDEX "review_customer_id_review_status_idx" ON "review"("customer_id", "review_status");

-- CreateIndex
CREATE INDEX "favorite_mover_id_idx" ON "favorite"("mover_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_user_id_mover_id_key" ON "favorite"("user_id", "mover_id");

-- CreateIndex
CREATE INDEX "notification_user_id_is_read_idx" ON "notification"("user_id", "is_read");

-- AddForeignKey
ALTER TABLE "customer_profile" ADD CONSTRAINT "customer_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mover_profile" ADD CONSTRAINT "mover_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_service" ADD CONSTRAINT "customer_service_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mover_service" ADD CONSTRAINT "mover_service_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mover_region" ADD CONSTRAINT "mover_region_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_request" ADD CONSTRAINT "quotation_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "targeted_request" ADD CONSTRAINT "targeted_request_quotation_request_id_fkey" FOREIGN KEY ("quotation_request_id") REFERENCES "quotation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "targeted_request" ADD CONSTRAINT "targeted_request_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_quotation_request_id_fkey" FOREIGN KEY ("quotation_request_id") REFERENCES "quotation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_quotation_request_id_fkey" FOREIGN KEY ("quotation_request_id") REFERENCES "quotation_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 이메일 가입(LOCAL) 계정만 (role, email) 유니크를 강제합니다.
-- 소셜 계정은 (role, provider, provider_id)로 이미 중복을 막고 있어 제외합니다.
-- Prisma 스키마 문법으로 WHERE 조건부 유니크를 표현할 수 없어 raw SQL로 정의합니다.
CREATE UNIQUE INDEX "user_role_email_local_key"
  ON "user" ("role", "email")
  WHERE "provider" = 'LOCAL';