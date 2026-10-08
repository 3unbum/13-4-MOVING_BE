-- CreateTable
CREATE TABLE "review_image" (
    "id" SERIAL NOT NULL,
    "review_id" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_image_review_id_sort_order_idx" ON "review_image"("review_id", "sort_order");

-- AddForeignKey
ALTER TABLE "review_image" ADD CONSTRAINT "review_image_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
