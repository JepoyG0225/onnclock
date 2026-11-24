ALTER TABLE companies ADD COLUMN IF NOT EXISTS "hrOperationsSettings" JSONB;
CREATE TABLE IF NOT EXISTS hr_operations (
 id TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE, "companyId" TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 "employeeId" TEXT REFERENCES employees(id) ON DELETE CASCADE, kind TEXT NOT NULL, title VARCHAR(200) NOT NULL, status TEXT NOT NULL,
 "dueDate" DATE, "ownerId" TEXT, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "acknowledgedAt" TIMESTAMP(3), "reminderOn" DATE
);
CREATE INDEX IF NOT EXISTS hr_operations_scope_idx ON hr_operations("companyId",kind,status,"dueDate");
CREATE INDEX IF NOT EXISTS hr_operations_employee_idx ON hr_operations("employeeId",kind);
CREATE TABLE IF NOT EXISTS hr_operation_events (
 id TEXT PRIMARY KEY, "operationId" TEXT NOT NULL REFERENCES hr_operations(id) ON DELETE CASCADE, "actorId" TEXT NOT NULL,
 action TEXT NOT NULL, detail JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS hr_operation_events_record_idx ON hr_operation_events("operationId","createdAt");
CREATE TABLE IF NOT EXISTS hr_operation_files (
 id TEXT PRIMARY KEY, "operationId" TEXT NOT NULL REFERENCES hr_operations(id) ON DELETE CASCADE, "fileName" TEXT NOT NULL,
 "storagePath" TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, size INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS hr_operation_files_record_idx ON hr_operation_files("operationId");
