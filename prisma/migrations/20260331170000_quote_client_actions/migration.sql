ALTER TABLE "WorkOrder"
ADD COLUMN "quoteClientActionToken" TEXT,
ADD COLUMN "quoteClientRespondedAt" TIMESTAMP(3),
ADD COLUMN "quoteClientRejectionReason" TEXT;

CREATE UNIQUE INDEX "WorkOrder_quoteClientActionToken_key"
ON "WorkOrder"("quoteClientActionToken");
