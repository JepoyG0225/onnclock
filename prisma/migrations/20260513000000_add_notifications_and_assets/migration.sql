-- Notifications
CREATE TYPE "NotificationType" AS ENUM (
  'LEAVE_REQUEST_SUBMITTED',
  'LEAVE_REQUEST_APPROVED',
  'LEAVE_REQUEST_REJECTED',
  'DTR_APPROVED',
  'DTR_REJECTED',
  'OT_REQUEST_APPROVED',
  'OT_REQUEST_REJECTED',
  'ANNOUNCEMENT_POSTED',
  'DOCUMENT_EXPIRING',
  'ASSET_ASSIGNED',
  'ASSET_RETURNED',
  'PAYSLIP_RELEASED',
  'GENERIC'
);

CREATE TABLE "notifications" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      "NotificationType" NOT NULL DEFAULT 'GENERIC',
  "title"     TEXT NOT NULL,
  "body"      TEXT,
  "link"      TEXT,
  "isRead"    BOOLEAN NOT NULL DEFAULT false,
  "readAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_userId_isRead_createdAt_idx"
  ON "notifications"("userId", "isRead", "createdAt");

CREATE INDEX "notifications_companyId_createdAt_idx"
  ON "notifications"("companyId", "createdAt");

-- Assets
CREATE TYPE "AssetStatus" AS ENUM (
  'AVAILABLE',
  'ASSIGNED',
  'IN_REPAIR',
  'RETIRED',
  'LOST'
);

CREATE TYPE "AssetAssignmentStatus" AS ENUM (
  'ACTIVE',
  'RETURNED'
);

CREATE TABLE "company_assets" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "assetTag"      TEXT,
  "category"      TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "serialNumber"  TEXT,
  "purchaseDate"  TIMESTAMP(3),
  "purchaseCost"  DECIMAL(12, 2),
  "warrantyUntil" TIMESTAMP(3),
  "status"        "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "company_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_assets_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "company_assets_companyId_status_idx"
  ON "company_assets"("companyId", "status");

CREATE INDEX "company_assets_companyId_category_idx"
  ON "company_assets"("companyId", "category");

CREATE TABLE "asset_assignments" (
  "id"                 TEXT NOT NULL,
  "assetId"            TEXT NOT NULL,
  "employeeId"         TEXT NOT NULL,
  "assignedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnedAt"         TIMESTAMP(3),
  "conditionAtIssue"   TEXT,
  "conditionAtReturn"  TEXT,
  "status"             "AssetAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "assignedById"       TEXT,
  "returnedById"       TEXT,
  "notes"              TEXT,

  CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_assignments_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "company_assets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "asset_assignments_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "asset_assignments_assetId_status_idx"
  ON "asset_assignments"("assetId", "status");

CREATE INDEX "asset_assignments_employeeId_status_idx"
  ON "asset_assignments"("employeeId", "status");
