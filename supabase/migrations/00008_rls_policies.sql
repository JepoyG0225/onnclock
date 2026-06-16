-- ============================================================
-- Philippines HR & Payroll — Supabase RLS Policies
-- Multi-tenant isolation: all queries scoped to company_id
-- ============================================================

-- Helper: Get all company IDs the current user belongs to
CREATE OR REPLACE FUNCTION get_user_company_ids()
RETURNS UUID[]
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT ARRAY_AGG(company_id)
  FROM user_companies
  WHERE user_id = auth.uid()::text
$$;

-- Helper: Check if user has HR or above role in a company
CREATE OR REPLACE FUNCTION is_hr_or_above(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = auth.uid()::text
      AND company_id = p_company_id
      AND role IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER')
  )
$$;

-- Helper: Check if user is payroll officer or above
CREATE OR REPLACE FUNCTION is_payroll_or_above(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = auth.uid()::text
      AND company_id = p_company_id
      AND role IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER')
  )
$$;

-- Helper: Check if user is admin
CREATE OR REPLACE FUNCTION is_admin(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = auth.uid()::text
      AND company_id = p_company_id
      AND role IN ('SUPER_ADMIN', 'COMPANY_ADMIN')
  )
$$;

-- ─── COMPANIES ───────────────────────────────────────────────────────────────

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own companies"
  ON companies FOR SELECT
  USING (id::uuid = ANY(get_user_company_ids()));

CREATE POLICY "Admins can update their company"
  ON companies FOR UPDATE
  USING (is_admin(id::uuid));

-- ─── USER_COMPANIES ──────────────────────────────────────────────────────────

ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own memberships"
  ON user_companies FOR SELECT
  USING (
    user_id = auth.uid()::text
    OR is_admin(company_id::uuid)
  );

CREATE POLICY "Admins manage memberships"
  ON user_companies FOR ALL
  USING (is_admin(company_id::uuid));

-- ─── DEPARTMENTS ─────────────────────────────────────────────────────────────

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read departments"
  ON departments FOR SELECT
  USING (company_id::uuid = ANY(get_user_company_ids()));

CREATE POLICY "HR+ can manage departments"
  ON departments FOR ALL
  USING (is_hr_or_above(company_id::uuid));

-- ─── POSITIONS ───────────────────────────────────────────────────────────────

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read positions"
  ON positions FOR SELECT
  USING (company_id::uuid = ANY(get_user_company_ids()));

CREATE POLICY "HR+ can manage positions"
  ON positions FOR ALL
  USING (is_hr_or_above(company_id::uuid));

-- ─── PAY_GRADES ──────────────────────────────────────────────────────────────

ALTER TABLE pay_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read pay grades"
  ON pay_grades FOR SELECT
  USING (company_id::uuid = ANY(get_user_company_ids()));

CREATE POLICY "HR+ can manage pay grades"
  ON pay_grades FOR ALL
  USING (is_hr_or_above(company_id::uuid));

-- ─── EMPLOYEES ───────────────────────────────────────────────────────────────

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- HR can read all employees in their company
CREATE POLICY "HR+ can read all employees"
  ON employees FOR SELECT
  USING (
    company_id::uuid = ANY(get_user_company_ids())
    AND is_hr_or_above(company_id::uuid)
  );

-- Employees can read their own record
CREATE POLICY "Employees can read own record"
  ON employees FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "HR+ can manage employees"
  ON employees FOR ALL
  USING (is_hr_or_above(company_id::uuid));

-- ─── EMPLOYEE_DOCUMENTS ──────────────────────────────────────────────────────

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR+ can manage employee documents"
  ON employee_documents FOR ALL
  USING (company_id::uuid = ANY(get_user_company_ids()) AND is_hr_or_above(company_id::uuid));

-- ─── HOLIDAYS ────────────────────────────────────────────────────────────────

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read holidays"
  ON holidays FOR SELECT
  USING (company_id::uuid = ANY(get_user_company_ids()));

CREATE POLICY "Admins can manage holidays"
  ON holidays FOR ALL
  USING (is_admin(company_id::uuid));

-- ─── WORK_SCHEDULES ──────────────────────────────────────────────────────────

ALTER TABLE work_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read schedules"
  ON work_schedules FOR SELECT
  USING (company_id::uuid = ANY(get_user_company_ids()));

CREATE POLICY "HR+ can manage schedules"
  ON work_schedules FOR ALL
  USING (is_hr_or_above(company_id::uuid));

-- ─── DTR_RECORDS ─────────────────────────────────────────────────────────────

ALTER TABLE dtr_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR+ can see all DTR records"
  ON dtr_records FOR SELECT
  USING (
    company_id::uuid = ANY(get_user_company_ids())
    AND is_hr_or_above(company_id::uuid)
  );

CREATE POLICY "Employees see own DTR"
  ON dtr_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_id AND e.user_id = auth.uid()::text
    )
  );

CREATE POLICY "HR+ can manage DTR"
  ON dtr_records FOR ALL
  USING (is_hr_or_above(company_id::uuid));

-- ─── LEAVE_TYPES ─────────────────────────────────────────────────────────────

ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read leave types"
  ON leave_types FOR SELECT
  USING (company_id::uuid = ANY(get_user_company_ids()));

CREATE POLICY "HR+ can manage leave types"
  ON leave_types FOR ALL
  USING (is_hr_or_above(company_id::uuid));

-- ─── LEAVE_BALANCES ──────────────────────────────────────────────────────────

ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR+ can see all leave balances"
  ON leave_balances FOR SELECT
  USING (
    company_id::uuid = ANY(get_user_company_ids())
    AND is_hr_or_above(company_id::uuid)
  );

CREATE POLICY "Employees see own leave balance"
  ON leave_balances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_id AND e.user_id = auth.uid()::text
    )
  );

CREATE POLICY "HR+ can manage leave balances"
  ON leave_balances FOR ALL
  USING (is_hr_or_above(company_id::uuid));

-- ─── LEAVE_REQUESTS ──────────────────────────────────────────────────────────

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR+ can see all leave requests"
  ON leave_requests FOR SELECT
  USING (
    company_id::uuid = ANY(get_user_company_ids())
    AND is_hr_or_above(company_id::uuid)
  );

CREATE POLICY "Employees see own leave requests"
  ON leave_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_id AND e.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Employees can file leave requests"
  ON leave_requests FOR INSERT
  WITH CHECK (
    company_id::uuid = ANY(get_user_company_ids())
    AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_id AND e.user_id = auth.uid()::text
    )
  );

CREATE POLICY "HR+ can approve/reject"
  ON leave_requests FOR UPDATE
  USING (is_hr_or_above(company_id::uuid));

-- ─── PAYROLL_RUNS ─────────────────────────────────────────────────────────────

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll+ can read payroll runs"
  ON payroll_runs FOR SELECT
  USING (
    company_id::uuid = ANY(get_user_company_ids())
    AND is_payroll_or_above(company_id::uuid)
  );

CREATE POLICY "Payroll+ can manage payroll runs"
  ON payroll_runs FOR ALL
  USING (is_payroll_or_above(company_id::uuid));

-- ─── PAYSLIPS ────────────────────────────────────────────────────────────────

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll+ can read all payslips"
  ON payslips FOR SELECT
  USING (
    company_id::uuid = ANY(get_user_company_ids())
    AND is_payroll_or_above(company_id::uuid)
  );

CREATE POLICY "Employees can read own payslip"
  ON payslips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_id AND e.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Payroll+ can manage payslips"
  ON payslips FOR ALL
  USING (is_payroll_or_above(company_id::uuid));

-- ─── EMPLOYEE_LOANS ──────────────────────────────────────────────────────────

ALTER TABLE employee_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll+ can manage loans"
  ON employee_loans FOR ALL
  USING (is_payroll_or_above(company_id::uuid));

CREATE POLICY "Employees see own loans"
  ON employee_loans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_id AND e.user_id = auth.uid()::text
    )
  );

-- ─── CONTRIBUTION_CONFIG ─────────────────────────────────────────────────────

ALTER TABLE contribution_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read contribution config"
  ON contribution_config FOR SELECT
  USING (company_id::uuid = ANY(get_user_company_ids()));

CREATE POLICY "Admins can manage contribution config"
  ON contribution_config FOR ALL
  USING (is_admin(company_id::uuid));

-- ─── AUDIT_LOGS ──────────────────────────────────────────────────────────────

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs"
  ON audit_logs FOR SELECT
  USING (
    company_id::uuid = ANY(get_user_company_ids())
    AND is_admin(company_id::uuid)
  );

CREATE POLICY "System can write audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (company_id::uuid = ANY(get_user_company_ids()));
