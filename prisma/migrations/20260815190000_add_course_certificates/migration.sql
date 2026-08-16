ALTER TABLE "employee_certifications" ADD COLUMN "sourceCourseId" TEXT;
CREATE UNIQUE INDEX "employee_certifications_employeeId_sourceCourseId_key" ON "employee_certifications"("employeeId", "sourceCourseId");
ALTER TABLE "employee_certifications" ADD CONSTRAINT "employee_certifications_sourceCourseId_fkey" FOREIGN KEY ("sourceCourseId") REFERENCES "learning_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
