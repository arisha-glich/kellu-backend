/*
  Warnings:

  - The values [UNASSIGNED,ON_MY_WAY,IN_PROGRESS,COMPLETED,CANCELLED] on the enum `JobStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."JobStatus_new" AS ENUM ('UNSCHEDULED', 'SCHEDULED', 'NOT_APPLIED');
ALTER TABLE "public"."WorkOrder" ALTER COLUMN "jobStatus" DROP DEFAULT;
ALTER TABLE "public"."WorkOrder" ALTER COLUMN "jobStatus" TYPE "public"."JobStatus_new" USING ("jobStatus"::text::"public"."JobStatus_new");
ALTER TYPE "public"."JobStatus" RENAME TO "JobStatus_old";
ALTER TYPE "public"."JobStatus_new" RENAME TO "JobStatus";
DROP TYPE "public"."JobStatus_old";
ALTER TABLE "public"."WorkOrder" ALTER COLUMN "jobStatus" SET DEFAULT 'UNSCHEDULED';
COMMIT;
