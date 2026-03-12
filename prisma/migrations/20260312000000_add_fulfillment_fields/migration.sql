-- AlterTable
ALTER TABLE "Order" ADD COLUMN "trackingCode" TEXT,
ADD COLUMN "trackingUrl" TEXT,
ADD COLUMN "shippedAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3);
