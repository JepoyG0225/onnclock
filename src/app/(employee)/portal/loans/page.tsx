'use client'

/**
 * Loans — the employee's cash advances and loans in one place.
 *
 * A cash advance IS a loan in this system: approving one creates an
 * EmployeeLoan and both deduct through the same payslip machinery. They were
 * only separate in the portal nav, which mirrors the merge already done on the
 * admin side.
 *
 * Cash Advance leads, because it is the request an employee files most often.
 */
import { Banknote, CreditCard } from 'lucide-react'
import { TabbedPage } from '@/components/layout/TabbedPage'
import { CashAdvanceTab } from '@/components/employee/CashAdvanceTab'
import { MyLoansTab } from '@/components/employee/MyLoansTab'

export default function PortalLoansPage() {
  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-2xl mx-auto">
    <TabbedPage
      basePath="/portal/loans"
      tabs={[
        { id: 'cash-advance', label: 'Cash Advance', icon: Banknote,   render: () => <CashAdvanceTab /> },
        { id: 'loans',        label: 'My Loans',     icon: CreditCard, render: () => <MyLoansTab /> },
      ]}
    />
    </div>
  )
}
