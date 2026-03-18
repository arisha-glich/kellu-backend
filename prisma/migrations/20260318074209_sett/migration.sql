-- AlterTable
ALTER TABLE "public"."Business" ADD COLUMN     "city" TEXT,
ADD COLUMN     "primaryColor" TEXT,
ADD COLUMN     "secondaryColor" TEXT,
ADD COLUMN     "street1" TEXT,
ADD COLUMN     "street2" TEXT;

-- AlterTable
ALTER TABLE "public"."BusinessSettings" ADD COLUMN     "arrivalWindowHours" INTEGER;
