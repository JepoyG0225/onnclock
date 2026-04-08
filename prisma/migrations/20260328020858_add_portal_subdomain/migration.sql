/*
  Warnings:

  - A unique constraint covering the columns `[portalSubdomain]` on the table `companies` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `companies` ADD COLUMN `portalSubdomain` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `companies_portalSubdomain_key` ON `companies`(`portalSubdomain`);
