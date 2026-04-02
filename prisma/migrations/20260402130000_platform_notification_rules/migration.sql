-- Platform notification rules (admin portal) + BCC address for client-facing business emails
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "clientEmailCopyTo" TEXT;

CREATE TABLE IF NOT EXISTS "PlatformNotificationRule" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "triggerDescription" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformNotificationRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformNotificationRule_eventKey_key" ON "PlatformNotificationRule"("eventKey");
