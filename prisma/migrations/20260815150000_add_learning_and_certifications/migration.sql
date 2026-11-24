CREATE TABLE "learning_courses" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "provider" TEXT,
  "description" TEXT,
  "category" TEXT,
  "durationHours" DECIMAL(8,2),
  "validityMonths" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learning_courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_enrollments" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" DATE,
  "completedAt" DATE,
  "score" DECIMAL(5,2),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learning_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_certifications" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "issuingBody" TEXT,
  "credentialId" TEXT,
  "issuedDate" DATE,
  "expiryDate" DATE,
  "certificateUrl" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_certifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "learning_courses_companyId_isActive_idx" ON "learning_courses"("companyId", "isActive");
CREATE UNIQUE INDEX "learning_enrollments_courseId_employeeId_key" ON "learning_enrollments"("courseId", "employeeId");
CREATE INDEX "learning_enrollments_employeeId_status_idx" ON "learning_enrollments"("employeeId", "status");
CREATE INDEX "employee_certifications_employeeId_expiryDate_idx" ON "employee_certifications"("employeeId", "expiryDate");
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_enrollments" ADD CONSTRAINT "learning_enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "learning_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_enrollments" ADD CONSTRAINT "learning_enrollments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_certifications" ADD CONSTRAINT "employee_certifications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
