-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "isAnyTime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "taskStatus" "public"."TaskStatus" NOT NULL DEFAULT 'SCHEDULED';
