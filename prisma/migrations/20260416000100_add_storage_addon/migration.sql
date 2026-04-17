-- Add storage add-on fields to subscriptions table
ALTER TABLE "subscriptions" ADD COLUMN "storageAddOnGb" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD COLUMN "storageAddOnPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;
