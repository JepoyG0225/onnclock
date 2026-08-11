'use client'

/**
 * Loans — employee loans and cash advances.
 *
 * A cash advance IS a loan in this system: approving one creates an
 * EmployeeLoan with LoanType.CASH_ADVANCE, and both deduct through the same
 * payslip machinery. They were only separate in the sidebar.
 */
import { CreditCard, Wallet } from 'lucide-react'
import { TabbedPage } from '@/components/layout/TabbedPage'
import { LoansTab } from '@/components/loans/LoansTab'
import { CashAdvanceTab } from '@/components/loans/CashAdvanceTab'

export default function LoansPage() {
  return (
    <TabbedPage
      basePath="/loans"
      tabs={[
        { id: 'loans',        label: 'Loans',          icon: CreditCard, render: () => <LoansTab /> },
        { id: 'cash-advance', label: 'Cash Advances',  icon: Wallet,     render: () => <CashAdvanceTab /> },
      ]}
    />
  )
}
