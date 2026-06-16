-- Performance indexes for common query patterns

-- Employee: filter by company, active status, department, employment status
CREATE INDEX IF NOT EXISTS "employees_companyId_idx" ON "employees"("companyId");
CREATE INDEX IF NOT EXISTS "employees_companyId_isActive_idx" ON "employees"("companyId", "isActive");
CREATE INDEX IF NOT EXISTS "employees_companyId_departmentId_idx" ON "employees"("companyId", "departmentId");
CREATE INDEX IF NOT EXISTS "employees_companyId_employmentStatus_idx" ON "employees"("companyId", "employmentStatus");

-- DTRRecord: filter by employee + approval status, date range
CREATE INDEX IF NOT EXISTS "dtr_records_employeeId_approvedBy_idx" ON "dtr_records"("employeeId", "approvedBy");
CREATE INDEX IF NOT EXISTS "dtr_records_employeeId_date_idx" ON "dtr_records"("employeeId", "date");

-- LeaveRequest: filter by employee + status, date
CREATE INDEX IF NOT EXISTS "leave_requests_employeeId_status_idx" ON "leave_requests"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "leave_requests_employeeId_createdAt_idx" ON "leave_requests"("employeeId", "createdAt");

-- PayrollRun: filter by company + status, period
CREATE INDEX IF NOT EXISTS "payroll_runs_companyId_status_idx" ON "payroll_runs"("companyId", "status");
CREATE INDEX IF NOT EXISTS "payroll_runs_companyId_periodStart_idx" ON "payroll_runs"("companyId", "periodStart");

-- Payslip: filter by employee
CREATE INDEX IF NOT EXISTS "payslips_employeeId_idx" ON "payslips"("employeeId");
