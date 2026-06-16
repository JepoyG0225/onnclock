-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `companies` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `tradeName` VARCHAR(191) NULL,
    `industry` VARCHAR(191) NULL,
    `tin` VARCHAR(191) NULL,
    `sssRegistrationNo` VARCHAR(191) NULL,
    `philhealthNo` VARCHAR(191) NULL,
    `pagibigNo` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `province` VARCHAR(191) NULL,
    `zipCode` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `birNo` VARCHAR(191) NULL,
    `portalUrl` VARCHAR(191) NULL,
    `logoUrl` LONGTEXT NULL,
    `geofenceEnabled` BOOLEAN NOT NULL DEFAULT false,
    `geofenceLat` DOUBLE NULL,
    `geofenceLng` DOUBLE NULL,
    `geofenceRadiusMeters` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_companies` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_companies_userId_companyId_key`(`userId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `parentId` VARCHAR(191) NULL,
    `headId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `positions` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `payGradeId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_grades` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `minSalary` DECIMAL(12, 2) NOT NULL,
    `maxSalary` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `employeeNo` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `middleName` VARCHAR(191) NULL,
    `suffix` VARCHAR(191) NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
    `birthDate` DATE NOT NULL,
    `birthPlace` VARCHAR(191) NULL,
    `civilStatus` ENUM('SINGLE', 'MARRIED', 'WIDOWED', 'LEGALLY_SEPARATED') NOT NULL DEFAULT 'SINGLE',
    `nationality` VARCHAR(191) NOT NULL DEFAULT 'Filipino',
    `religion` VARCHAR(191) NULL,
    `personalEmail` VARCHAR(191) NULL,
    `workEmail` VARCHAR(191) NULL,
    `mobileNo` VARCHAR(191) NULL,
    `phoneNo` VARCHAR(191) NULL,
    `presentAddress` VARCHAR(191) NULL,
    `permanentAddress` VARCHAR(191) NULL,
    `sssNo` VARCHAR(191) NULL,
    `tinNo` VARCHAR(191) NULL,
    `philhealthNo` VARCHAR(191) NULL,
    `pagibigNo` VARCHAR(191) NULL,
    `emergencyContactName` VARCHAR(191) NULL,
    `emergencyContactRelation` VARCHAR(191) NULL,
    `emergencyContactPhone` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `positionId` VARCHAR(191) NULL,
    `directManagerId` VARCHAR(191) NULL,
    `employmentStatus` ENUM('PROBATIONARY', 'REGULAR', 'CONTRACTUAL', 'PROJECT_BASED', 'PART_TIME', 'RESIGNED', 'TERMINATED', 'RETIRED') NOT NULL DEFAULT 'PROBATIONARY',
    `employmentType` ENUM('FULL_TIME', 'PART_TIME', 'CONTRACTUAL') NOT NULL DEFAULT 'FULL_TIME',
    `hireDate` DATE NOT NULL,
    `regularizationDate` DATE NULL,
    `resignationDate` DATE NULL,
    `terminationDate` DATE NULL,
    `rateType` ENUM('MONTHLY', 'DAILY', 'HOURLY') NOT NULL DEFAULT 'MONTHLY',
    `basicSalary` DECIMAL(12, 2) NOT NULL,
    `dailyRate` DECIMAL(10, 2) NULL,
    `hourlyRate` DECIMAL(8, 2) NULL,
    `payFrequency` ENUM('SEMI_MONTHLY', 'MONTHLY', 'WEEKLY', 'DAILY') NOT NULL DEFAULT 'SEMI_MONTHLY',
    `workScheduleId` VARCHAR(191) NULL,
    `bankName` VARCHAR(191) NULL,
    `bankAccountNo` VARCHAR(191) NULL,
    `isExemptFromTax` BOOLEAN NOT NULL DEFAULT false,
    `isMinimumWageEarner` BOOLEAN NOT NULL DEFAULT false,
    `trackTime` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `photoUrl` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employees_companyId_employeeNo_key`(`companyId`, `employeeNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_documents` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `documentType` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `scheduleType` ENUM('FIXED', 'FLEXITIME', 'SHIFTING', 'COMPRESSED') NOT NULL DEFAULT 'FIXED',
    `workDays` JSON NOT NULL,
    `timeIn` VARCHAR(191) NULL,
    `timeOut` VARCHAR(191) NULL,
    `breakMinutes` INTEGER NOT NULL DEFAULT 60,
    `workHoursPerDay` DECIMAL(4, 2) NOT NULL DEFAULT 8,
    `workDaysPerWeek` INTEGER NOT NULL DEFAULT 5,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_shifts` (
    `id` VARCHAR(191) NOT NULL,
    `workScheduleId` VARCHAR(191) NOT NULL,
    `shiftName` VARCHAR(191) NOT NULL,
    `dayOfWeek` INTEGER NULL,
    `timeIn` VARCHAR(191) NOT NULL,
    `timeOut` VARCHAR(191) NOT NULL,
    `breakMinutes` INTEGER NOT NULL DEFAULT 60,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holidays` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `type` ENUM('REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING') NOT NULL,
    `isRecurring` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dtr_records` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `timeIn` DATETIME(3) NULL,
    `timeOut` DATETIME(3) NULL,
    `breakIn` DATETIME(3) NULL,
    `breakOut` DATETIME(3) NULL,
    `regularHours` DECIMAL(6, 2) NULL,
    `overtimeHours` DECIMAL(6, 2) NULL,
    `nightDiffHours` DECIMAL(6, 2) NULL,
    `lateMinutes` INTEGER NULL DEFAULT 0,
    `undertimeMinutes` INTEGER NULL DEFAULT 0,
    `isRestDay` BOOLEAN NOT NULL DEFAULT false,
    `isHoliday` BOOLEAN NOT NULL DEFAULT false,
    `holidayType` ENUM('REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING') NULL,
    `isAbsent` BOOLEAN NOT NULL DEFAULT false,
    `isLeave` BOOLEAN NOT NULL DEFAULT false,
    `leaveRequestId` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `remarks` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `clockInLat` DOUBLE NULL,
    `clockInLng` DOUBLE NULL,
    `clockInAccuracy` DOUBLE NULL,
    `clockInAddress` VARCHAR(191) NULL,
    `clockOutLat` DOUBLE NULL,
    `clockOutLng` DOUBLE NULL,
    `clockOutAccuracy` DOUBLE NULL,
    `clockOutAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dtr_records_employeeId_date_key`(`employeeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_types` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `daysEntitled` DECIMAL(6, 2) NOT NULL,
    `isWithPay` BOOLEAN NOT NULL DEFAULT true,
    `isPaidOut` BOOLEAN NOT NULL DEFAULT false,
    `isMandatory` BOOLEAN NOT NULL DEFAULT true,
    `requiresDocuments` BOOLEAN NOT NULL DEFAULT false,
    `genderRestriction` VARCHAR(191) NULL,
    `accrualType` VARCHAR(191) NOT NULL DEFAULT 'ANNUAL',
    `carryOver` BOOLEAN NOT NULL DEFAULT false,
    `maxCarryOver` DECIMAL(6, 2) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `leave_types_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_balances` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `leaveTypeId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `entitled` DECIMAL(6, 2) NOT NULL,
    `used` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `pending` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `carriedOver` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `encashed` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `leave_balances_employeeId_leaveTypeId_year_key`(`employeeId`, `leaveTypeId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_requests` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `leaveTypeId` VARCHAR(191) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `totalDays` DECIMAL(6, 2) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `supportingDocs` JSON NOT NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNotes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contribution_configs` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `sssEmployeeRate` DECIMAL(6, 4) NOT NULL DEFAULT 0.0450,
    `sssEmployerRate` DECIMAL(6, 4) NOT NULL DEFAULT 0.0950,
    `sssEcRate` DECIMAL(6, 4) NOT NULL DEFAULT 0.0010,
    `sssMinMsc` DECIMAL(12, 2) NOT NULL DEFAULT 4000,
    `sssMaxMsc` DECIMAL(12, 2) NOT NULL DEFAULT 30000,
    `philhealthRate` DECIMAL(6, 4) NOT NULL DEFAULT 0.0500,
    `philhealthMinPremium` DECIMAL(12, 2) NOT NULL DEFAULT 500,
    `philhealthMaxSalary` DECIMAL(12, 2) NOT NULL DEFAULT 100000,
    `pagibigEmployeeRate1` DECIMAL(6, 4) NOT NULL DEFAULT 0.0100,
    `pagibigEmployeeRate2` DECIMAL(6, 4) NOT NULL DEFAULT 0.0200,
    `pagibigThreshold` DECIMAL(12, 2) NOT NULL DEFAULT 1500,
    `pagibigEmployerRate` DECIMAL(6, 4) NOT NULL DEFAULT 0.0200,
    `pagibigMaxEmployee` DECIMAL(12, 2) NOT NULL DEFAULT 100,
    `pagibigMaxEmployer` DECIMAL(12, 2) NOT NULL DEFAULT 100,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contribution_configs_companyId_key`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_runs` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `periodLabel` VARCHAR(191) NOT NULL,
    `periodStart` DATE NOT NULL,
    `periodEnd` DATE NOT NULL,
    `payFrequency` ENUM('SEMI_MONTHLY', 'MONTHLY', 'WEEKLY', 'DAILY') NOT NULL,
    `payDate` DATE NOT NULL,
    `status` ENUM('DRAFT', 'COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `totalBasic` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalGross` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalDeductions` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalNetPay` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalSssEr` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalPhEr` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalPagibigEr` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `createdBy` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `lockedAt` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payslips` (
    `id` VARCHAR(191) NOT NULL,
    `payrollRunId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `basicSalary` DECIMAL(12, 2) NOT NULL,
    `dailyRate` DECIMAL(10, 2) NOT NULL,
    `daysWorked` DECIMAL(6, 2) NOT NULL,
    `hoursWorked` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `regularOtHours` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `regularOtAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `restDayOtHours` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `restDayOtAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `holidayOtHours` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `holidayOtAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `nightDiffHours` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `nightDiffAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `holidayPayAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `riceAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `clothingAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `medicalAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `otherAllowances` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `otherEarnings` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grossPay` DECIMAL(12, 2) NOT NULL,
    `sssEmployee` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `sssEc` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `philhealthEmployee` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `pagibigEmployee` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `withholdingTax` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `sssEmployer` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `philhealthEmployer` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `pagibigEmployer` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `sssLoanDeduction` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `pagibigLoan` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `companyLoan` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `lateDeduction` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `undertimeDeduction` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `absenceDeduction` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `otherDeductions` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `totalDeductions` DECIMAL(12, 2) NOT NULL,
    `netPay` DECIMAL(12, 2) NOT NULL,
    `thirteenthMonthContribution` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taxableIncome` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `nonTaxableIncome` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `ytdGrossPay` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `ytdTaxableIncome` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `ytdWithholdingTax` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `pdfUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payslips_payrollRunId_employeeId_key`(`payrollRunId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `overtime_records` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `hours` DECIMAL(6, 2) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `rate` DECIMAL(6, 4) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `payrollRunId` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_loans` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `loanType` ENUM('SSS_SALARY_LOAN', 'SSS_CALAMITY_LOAN', 'PAGIBIG_MULTI_PURPOSE', 'PAGIBIG_CALAMITY', 'COMPANY_LOAN', 'OTHER') NOT NULL,
    `loanNo` VARCHAR(191) NULL,
    `principalAmount` DECIMAL(12, 2) NOT NULL,
    `balance` DECIMAL(12, 2) NOT NULL,
    `monthlyAmortization` DECIMAL(10, 2) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `status` ENUM('ACTIVE', 'FULLY_PAID', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payslip_loan_deductions` (
    `id` VARCHAR(191) NOT NULL,
    `payslipId` VARCHAR(191) NOT NULL,
    `loanId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `de_minimis_configs` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `riceSubsidy` DECIMAL(10, 2) NOT NULL DEFAULT 2000,
    `clothingAllowance` DECIMAL(10, 2) NOT NULL DEFAULT 6000,
    `medicalCash` DECIMAL(10, 2) NOT NULL DEFAULT 10000,
    `laundryAllowance` DECIMAL(10, 2) NOT NULL DEFAULT 300,
    `mealAllowance` DECIMAL(10, 2) NOT NULL DEFAULT 2000,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `de_minimis_configs_companyId_key`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `de_minimis_items` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `riceSubsidy` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `clothing` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `medical` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `laundry` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `meal` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `other` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `de_minimis_items_employeeId_period_key`(`employeeId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tax_exemptions` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `effectiveYear` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'S',
    `qualifyingDependents` INTEGER NOT NULL DEFAULT 0,
    `premiumsOnHealthHospital` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tax_exemptions_employeeId_effectiveYear_key`(`employeeId`, `effectiveYear`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `oldValues` JSON NULL,
    `newValues` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_companyId_entity_idx`(`companyId`, `entity`),
    INDEX `audit_logs_entityId_idx`(`entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `location_pings` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `dtrRecordId` VARCHAR(191) NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `accuracy` DOUBLE NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `location_pings_employeeId_recordedAt_idx`(`employeeId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thirteenth_month_logs` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `janBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `febBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `marBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `aprBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `mayBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `junBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `julBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `augBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `sepBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `octBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `novBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `decBasic` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `totalBasicPaid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `thirteenthAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `proRatedMonths` DECIMAL(4, 2) NOT NULL DEFAULT 0,
    `isPaid` BOOLEAN NOT NULL DEFAULT false,
    `paidAt` DATETIME(3) NULL,
    `payrollRunId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `thirteenth_month_logs_companyId_year_idx`(`companyId`, `year`),
    UNIQUE INDEX `thirteenth_month_logs_employeeId_year_key`(`employeeId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_role_permissions` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'EMPLOYEE') NOT NULL,
    `permissions` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `company_role_permissions_companyId_role_key`(`companyId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `approver_configs` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `approver_configs_companyId_type_level_key`(`companyId`, `type`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_companies` ADD CONSTRAINT `user_companies_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_companies` ADD CONSTRAINT `user_companies_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `positions` ADD CONSTRAINT `positions_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `positions` ADD CONSTRAINT `positions_payGradeId_fkey` FOREIGN KEY (`payGradeId`) REFERENCES `pay_grades`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pay_grades` ADD CONSTRAINT `pay_grades_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `positions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_workScheduleId_fkey` FOREIGN KEY (`workScheduleId`) REFERENCES `work_schedules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_directManagerId_fkey` FOREIGN KEY (`directManagerId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_documents` ADD CONSTRAINT `employee_documents_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_schedules` ADD CONSTRAINT `work_schedules_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_shifts` ADD CONSTRAINT `schedule_shifts_workScheduleId_fkey` FOREIGN KEY (`workScheduleId`) REFERENCES `work_schedules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `holidays` ADD CONSTRAINT `holidays_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dtr_records` ADD CONSTRAINT `dtr_records_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_types` ADD CONSTRAINT `leave_types_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_balances` ADD CONSTRAINT `leave_balances_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_balances` ADD CONSTRAINT `leave_balances_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `leave_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `leave_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contribution_configs` ADD CONSTRAINT `contribution_configs_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_runs` ADD CONSTRAINT `payroll_runs_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payslips` ADD CONSTRAINT `payslips_payrollRunId_fkey` FOREIGN KEY (`payrollRunId`) REFERENCES `payroll_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payslips` ADD CONSTRAINT `payslips_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `overtime_records` ADD CONSTRAINT `overtime_records_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_loans` ADD CONSTRAINT `employee_loans_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_loans` ADD CONSTRAINT `employee_loans_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payslip_loan_deductions` ADD CONSTRAINT `payslip_loan_deductions_payslipId_fkey` FOREIGN KEY (`payslipId`) REFERENCES `payslips`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payslip_loan_deductions` ADD CONSTRAINT `payslip_loan_deductions_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `employee_loans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `de_minimis_configs` ADD CONSTRAINT `de_minimis_configs_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `de_minimis_items` ADD CONSTRAINT `de_minimis_items_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tax_exemptions` ADD CONSTRAINT `tax_exemptions_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `location_pings` ADD CONSTRAINT `location_pings_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `location_pings` ADD CONSTRAINT `location_pings_dtrRecordId_fkey` FOREIGN KEY (`dtrRecordId`) REFERENCES `dtr_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thirteenth_month_logs` ADD CONSTRAINT `thirteenth_month_logs_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thirteenth_month_logs` ADD CONSTRAINT `thirteenth_month_logs_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_role_permissions` ADD CONSTRAINT `company_role_permissions_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approver_configs` ADD CONSTRAINT `approver_configs_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approver_configs` ADD CONSTRAINT `approver_configs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
