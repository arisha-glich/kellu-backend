-- DropForeignKey
ALTER TABLE "public"."ReminderLog" DROP CONSTRAINT "ReminderLog_clientId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ReminderLog" DROP CONSTRAINT "ReminderLog_workOrderId_fkey";

-- AddForeignKey
ALTER TABLE "public"."ReminderLog" ADD CONSTRAINT "ReminderLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReminderLog" ADD CONSTRAINT "ReminderLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
