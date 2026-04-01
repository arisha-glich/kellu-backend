-- CreateEnum
CREATE TYPE "RolePortalScope" AS ENUM ('BUSINESS_PORTAL', 'ADMIN_PORTAL');

-- AlterTable
ALTER TABLE "Role" ADD COLUMN "portalScope" "RolePortalScope" NOT NULL DEFAULT 'BUSINESS_PORTAL';

-- DropIndex
DROP INDEX IF EXISTS "Role_businessId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Role_businessId_name_portalScope_key" ON "Role"("businessId", "name", "portalScope");
