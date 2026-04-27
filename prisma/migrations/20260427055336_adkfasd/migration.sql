-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_clientId_fkey";

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
