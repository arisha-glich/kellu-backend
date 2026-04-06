-- Separate Quote from WorkOrder: new Quote + QuoteAttachment tables, LineItem.quoteId, migrate data, drop quote columns from WorkOrder.

CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "instructions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isScheduleLater" BOOLEAN NOT NULL DEFAULT true,
    "isAnyTime" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" TIMESTAMP(3),
    "startTime" TEXT,
    "endTime" TEXT,
    "clientId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "relatedWorkOrderId" TEXT,
    "convertedToWorkOrderId" TEXT,
    "quoteStatus" "QuoteStatus" NOT NULL DEFAULT 'NOT_SENT',
    "quoteSentAt" TIMESTAMP(3),
    "quoteApprovedAt" TIMESTAMP(3),
    "quoteRejectedAt" TIMESTAMP(3),
    "quoteExpiredAt" TIMESTAMP(3),
    "quoteConvertedAt" TIMESTAMP(3),
    "quoteExpiresAt" TIMESTAMP(3),
    "lastQuotePdfUrl" TEXT,
    "quoteCorrelative" TEXT,
    "quoteClientActionToken" TEXT,
    "quoteClientRespondedAt" TIMESTAMP(3),
    "quoteClientRejectionReason" TEXT,
    "quoteWhatsappStatus" TEXT,
    "quoteObservations" TEXT,
    "quoteTermsConditions" TEXT,
    "quoteVersion" INTEGER NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(12,2),
    "discount" DECIMAL(12,2),
    "discountType" "DiscountType",
    "tax" DECIMAL(12,2),
    "total" DECIMAL(12,2),
    "cost" DECIMAL(12,2),
    "amountPaid" DECIMAL(12,2) DEFAULT 0,
    "balance" DECIMAL(12,2),
    "lastJobReportPdfUrl" TEXT,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Quote_businessId_quoteNumber_key" ON "Quote"("businessId", "quoteNumber");

CREATE TABLE "QuoteAttachment" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "quoteId" TEXT NOT NULL,

    CONSTRAINT "QuoteAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteAttachment_quoteId_idx" ON "QuoteAttachment"("quoteId");

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_relatedWorkOrderId_fkey" FOREIGN KEY ("relatedWorkOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_convertedToWorkOrderId_fkey" FOREIGN KEY ("convertedToWorkOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuoteAttachment" ADD CONSTRAINT "QuoteAttachment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Quote" (
    "id",
    "quoteNumber",
    "title",
    "address",
    "instructions",
    "notes",
    "createdAt",
    "updatedAt",
    "isScheduleLater",
    "isAnyTime",
    "scheduledAt",
    "startTime",
    "endTime",
    "clientId",
    "businessId",
    "assignedToId",
    "relatedWorkOrderId",
    "convertedToWorkOrderId",
    "quoteStatus",
    "quoteSentAt",
    "quoteApprovedAt",
    "quoteRejectedAt",
    "quoteExpiredAt",
    "quoteConvertedAt",
    "quoteExpiresAt",
    "lastQuotePdfUrl",
    "quoteCorrelative",
    "quoteClientActionToken",
    "quoteClientRespondedAt",
    "quoteClientRejectionReason",
    "quoteWhatsappStatus",
    "quoteObservations",
    "quoteTermsConditions",
    "quoteVersion",
    "subtotal",
    "discount",
    "discountType",
    "tax",
    "total",
    "cost",
    "amountPaid",
    "balance",
    "lastJobReportPdfUrl"
)
SELECT
    wo."id",
    wo."workOrderNumber",
    wo."title",
    wo."address",
    wo."instructions",
    wo."notes",
    wo."createdAt",
    wo."updatedAt",
    wo."isScheduleLater",
    wo."isAnyTime",
    wo."scheduledAt",
    wo."startTime",
    wo."endTime",
    wo."clientId",
    wo."businessId",
    wo."assignedToId",
    NULL,
    NULL,
    wo."quoteStatus",
    wo."quoteSentAt",
    wo."quoteApprovedAt",
    wo."quoteRejectedAt",
    wo."quoteExpiredAt",
    wo."quoteConvertedAt",
    wo."quoteExpiresAt",
    wo."lastQuotePdfUrl",
    wo."quoteCorrelative",
    wo."quoteClientActionToken",
    wo."quoteClientRespondedAt",
    wo."quoteClientRejectionReason",
    wo."quoteWhatsappStatus",
    wo."quoteObservations",
    wo."quoteTermsConditions",
    wo."quoteVersion",
    wo."subtotal",
    wo."discount",
    wo."discountType",
    wo."tax",
    wo."total",
    wo."cost",
    wo."amountPaid",
    wo."balance",
    wo."lastJobReportPdfUrl"
FROM "WorkOrder" wo
WHERE wo."quoteRequired" = true;

ALTER TABLE "LineItem" ADD COLUMN "quoteId" TEXT;

UPDATE "LineItem" li
SET "quoteId" = li."workOrderId"
FROM "WorkOrder" wo
WHERE li."workOrderId" = wo."id" AND wo."quoteRequired" = true;

UPDATE "LineItem" SET "workOrderId" = NULL WHERE "quoteId" IS NOT NULL;

CREATE INDEX "LineItem_quoteId_idx" ON "LineItem"("quoteId");

ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "QuoteAttachment" ("id", "url", "filename", "type", "createdAt", "updatedAt", "quoteId")
SELECT woa."id", woa."url", woa."filename", woa."type", woa."createdAt", woa."updatedAt", woa."workOrderId"
FROM "WorkOrderAttachment" woa
INNER JOIN "WorkOrder" wo ON wo."id" = woa."workOrderId" AND wo."quoteRequired" = true;

DELETE FROM "WorkOrderAttachment"
WHERE "workOrderId" IN (SELECT "id" FROM "WorkOrder" WHERE "quoteRequired" = true);

UPDATE "Payment" SET "workOrderId" = NULL
WHERE "workOrderId" IN (SELECT "id" FROM "WorkOrder" WHERE "quoteRequired" = true);

UPDATE "Expense" SET "workOrderId" = NULL
WHERE "workOrderId" IN (SELECT "id" FROM "WorkOrder" WHERE "quoteRequired" = true);

UPDATE "Invoice" SET "workOrderId" = NULL
WHERE "workOrderId" IN (SELECT "id" FROM "WorkOrder" WHERE "quoteRequired" = true);

UPDATE "Task" SET "workOrderId" = NULL
WHERE "workOrderId" IN (SELECT "id" FROM "WorkOrder" WHERE "quoteRequired" = true);

UPDATE "ReminderLog" SET "workOrderId" = NULL
WHERE "workOrderId" IN (SELECT "id" FROM "WorkOrder" WHERE "quoteRequired" = true);

DELETE FROM "WorkOrder" WHERE "quoteRequired" = true;

ALTER TABLE "WorkOrder" DROP COLUMN "quoteRequired",
DROP COLUMN "quoteStatus",
DROP COLUMN "quoteSentAt",
DROP COLUMN "quoteApprovedAt",
DROP COLUMN "quoteRejectedAt",
DROP COLUMN "quoteExpiredAt",
DROP COLUMN "quoteConvertedAt",
DROP COLUMN "quoteExpiresAt",
DROP COLUMN "lastQuotePdfUrl",
DROP COLUMN "quoteCorrelative",
DROP COLUMN "quoteClientActionToken",
DROP COLUMN "quoteClientRespondedAt",
DROP COLUMN "quoteClientRejectionReason",
DROP COLUMN "quoteWhatsappStatus",
DROP COLUMN "quoteObservations",
DROP COLUMN "quoteTermsConditions",
DROP COLUMN "quoteVersion";
