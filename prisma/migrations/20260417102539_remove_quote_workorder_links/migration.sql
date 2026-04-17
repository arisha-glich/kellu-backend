/*
  Warnings:

  - You are about to drop the column `convertedToWorkOrderId` on the `Quote` table. All the data in the column will be lost.
  - You are about to drop the column `relatedWorkOrderId` on the `Quote` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Quote" DROP CONSTRAINT "Quote_convertedToWorkOrderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Quote" DROP CONSTRAINT "Quote_relatedWorkOrderId_fkey";

-- AlterTable
ALTER TABLE "public"."Quote" DROP COLUMN "convertedToWorkOrderId",
DROP COLUMN "relatedWorkOrderId";
