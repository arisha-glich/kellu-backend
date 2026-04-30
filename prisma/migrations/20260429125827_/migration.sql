/*
  Warnings:

  - The values [NOT_SENT] on the enum `QuoteStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."QuoteStatus_new" AS ENUM ('NOT_APPLIED', 'AWAITING_RESPONSE', 'APPROVED', 'CONVERTED', 'REJECTED', 'EXPIRED');
ALTER TABLE "public"."Quote" ALTER COLUMN "quoteStatus" DROP DEFAULT;
ALTER TABLE "public"."Quote" ALTER COLUMN "quoteStatus" TYPE "public"."QuoteStatus_new" USING ("quoteStatus"::text::"public"."QuoteStatus_new");
ALTER TYPE "public"."QuoteStatus" RENAME TO "QuoteStatus_old";
ALTER TYPE "public"."QuoteStatus_new" RENAME TO "QuoteStatus";
DROP TYPE "public"."QuoteStatus_old";
ALTER TABLE "public"."Quote" ALTER COLUMN "quoteStatus" SET DEFAULT 'NOT_APPLIED';
COMMIT;

-- AlterTable
ALTER TABLE "public"."Quote" ALTER COLUMN "quoteStatus" SET DEFAULT 'NOT_APPLIED';
