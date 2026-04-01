-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminPortalTeamMember" BOOLEAN NOT NULL DEFAULT false;
