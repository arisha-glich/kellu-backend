-- DropForeignKey
ALTER TABLE "public"."Quote" DROP CONSTRAINT "Quote_clientId_fkey";

-- AddForeignKey
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
