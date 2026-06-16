"use client"

import { ReactNode } from 'react'
import { RequestRowOpener } from '@/components/ui/request-row-opener'
import { BudgetReqDetailDialog } from '@/components/budget/BudgetReqDetailDialog'

export interface BudgetReqRowClientProps {
  children: ReactNode
  request: any
  canAct: boolean
  actionDisabledReason?: string | undefined
}

export function BudgetReqRowClient({ children, request, canAct, actionDisabledReason }: BudgetReqRowClientProps) {
  return (
    <RequestRowOpener
      renderDialog={(open, onClose) => (
        <BudgetReqDetailDialog
          open={open}
          onClose={onClose}
          request={request}
          canAct={canAct}
          actionDisabledReason={actionDisabledReason}
        />
      )}
    >
      {children}
    </RequestRowOpener>
  )
}

export default BudgetReqRowClient
