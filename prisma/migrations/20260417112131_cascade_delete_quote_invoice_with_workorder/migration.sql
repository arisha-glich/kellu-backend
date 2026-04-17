-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_workOrderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Quote" DROP CONSTRAINT "Quote_workOrderId_fkey";

-- AddForeignKey
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
