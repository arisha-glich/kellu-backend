-- Platform admin: permission catalog metadata (section UI + lock custom roles)
ALTER TABLE "permission" ADD COLUMN "section" TEXT;
ALTER TABLE "permission" ADD COLUMN "lockedForCustomRoles" BOOLEAN NOT NULL DEFAULT false;
