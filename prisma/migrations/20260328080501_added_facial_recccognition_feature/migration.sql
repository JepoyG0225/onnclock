-- AlterTable
ALTER TABLE `employees` ADD COLUMN `faceConsentAt` DATETIME(3) NULL,
    ADD COLUMN `faceEmbedding` JSON NULL,
    ADD COLUMN `faceEmbeddingModel` VARCHAR(191) NULL,
    ADD COLUMN `faceSetupAt` DATETIME(3) NULL;
