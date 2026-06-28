"use client"

import { ReactNode } from 'react'
import { RequestRowOpener } from '@/components/ui/request-row-opener'
import { BudgetReqDetailDialog } from '@/components/budget/BudgetReqDetailDialog'

export interface BudgetReqRowClientProps {
  children: ReactNode
  request: any
  canAct: boolean
  actionDisabledReason?: string | undefined
  canAddAttachments?: boolean
}

export function BudgetReqRowClient({ children, request, canAct, actionDisabledReason, canAddAttachments }: BudgetReqRowClientProps) {
  return (
    <RequestRowOpener
      renderDialog={(open, onClose) => (
        <BudgetReqDetailDialog
          open={open}
          onClose={onClose}
          request={request}
          canAct={canAct}
          actionDisabledReason={actionDisabledReason}
          canAddAttachments={canAddAttachments}
        />
      )}
    >
      {children}
    </RequestRowOpener>
  )
}

export default BudgetReqRowClient
