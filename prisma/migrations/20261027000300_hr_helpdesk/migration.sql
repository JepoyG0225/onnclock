CREATE TABLE IF NOT EXISTS "hr_requests" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE,
 "companyId" TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 "employeeId" TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
 "category" TEXT NOT NULL, "subject" VARCHAR(150) NOT NULL, "description" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OPEN', "priority" TEXT NOT NULL DEFAULT 'NORMAL',
 "neededBy" DATE, "assigneeId" TEXT, "resolution" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS hr_requests_company_status_idx ON hr_requests("companyId",status,"createdAt");
CREATE INDEX IF NOT EXISTS hr_requests_employee_idx ON hr_requests("employeeId","createdAt");
CREATE TABLE IF NOT EXISTS "hr_request_messages" (
 "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES hr_requests(id) ON DELETE CASCADE,
 "authorId" TEXT NOT NULL, "authorName" TEXT NOT NULL, "body" TEXT NOT NULL,
 "internal" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS hr_request_messages_request_idx ON hr_request_messages("requestId","createdAt");
CREATE TABLE IF NOT EXISTS "hr_request_attachments" (
 "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES hr_requests(id) ON DELETE CASCADE,
 "uploadedBy" TEXT NOT NULL, "fileName" TEXT NOT NULL, "storagePath" TEXT NOT NULL UNIQUE,
 "mime" TEXT NOT NULL, "size" INTEGER NOT NULL, "isDeliverable" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS hr_request_attachments_request_idx ON hr_request_attachments("requestId","createdAt");
