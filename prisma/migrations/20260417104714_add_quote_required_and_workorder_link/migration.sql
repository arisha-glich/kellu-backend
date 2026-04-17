-- AlterTable
ALTER TABLE "public"."Quote" ADD COLUMN     "quoteRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workOrderId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
