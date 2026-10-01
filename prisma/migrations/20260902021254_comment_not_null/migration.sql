/*
  Warnings:

  - Made the column `comment` on table `estimate` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "estimate" ALTER COLUMN "comment" SET NOT NULL,
ALTER COLUMN "estimate_status" SET DEFAULT 'PENDING';
