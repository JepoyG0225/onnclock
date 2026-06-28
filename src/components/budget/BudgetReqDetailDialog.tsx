'use client'

import { Building2, User, FileText, Calendar, ClipboardList, Paperclip, Download } from 'lucide-react'
import { RequestDetailDialog, DetailRow } from '@/components/ui/request-detail-dialog'
import { BudgetReqActionButtons } from '@/components/budget/BudgetReqActionButtons'
import { BudgetReqAttachmentUploader } from '@/components/budget/BudgetReqAttachmentUploader'

export interface BudgetReqDetailDialogProps {
  open: boolean
  onClose: () => void
  request: {
    id: string
    title: string
    purpose: string | null
    totalAmount: number | string
    currency?: string
    status: string
    neededBy: string | null
    createdAt: string
    employee: {
      firstName: string
      lastName: string
      employeeNo: string
      department: { name: string } | null
      position: { title: string } | null
    }
    items: Array<{
      id?: string
      description: string
      quantity?: number | string
      unit?: string | null
      unitCost?: number | string | null
      lineTotal?: number | string
    }>
    attachments: Array<{
      id: string
      fileName: string
      fileUrl: string
      fileSize: number
      mimeType: string
    }>
  }
  canAct: boolean
  actionDisabledReason?: string
  /** HR/admin can add attachments to this requisition regardless of status. */
  canAddAttachments?: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function peso(n: number | string): string {
  const num = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num)
}

export function BudgetReqDetailDialog({
  open,
  onClose,
  request,
  canAct,
  actionDisabledReason,
  canAddAttachments = false,
}: BudgetReqDetailDialogProps) {
  const employeeName = `${request.employee.firstName} ${request.employee.lastName}`
  const positionLine = [
    request.employee.position?.title,
    request.employee.department?.name,
  ].filter(Boolean).join(' · ') || 'Employee'

  return (
    <RequestDetailDialog
      open={open}
      onClose={onClose}
      type="BUDGET"
      id={request.id}
      title={request.title || 'Budget Requisition'}
      subtitle={`${employeeName} · ${positionLine} · #${request.employee.employeeNo}`}
      status={request.status}
      detailsSlot={
        <>
          <DetailRow
            icon={<Building2 className="h-4 w-4" />}
            label="Total Amount"
            value={<span className="text-base font-bold">{peso(request.totalAmount)}</span>}
          />
          <DetailRow
            icon={<Calendar className="h-4 w-4" />}
            label="Needed By"
            value={formatDate(request.neededBy)}
          />
          <DetailRow
            icon={<User className="h-4 w-4" />}
            label="Filed By"
            value={employeeName}
            hint={`${positionLine} · Submitted ${formatDate(request.createdAt)}`}
            className="sm:col-span-2"
          />
          {request.purpose && (
            <DetailRow
              icon={<FileText className="h-4 w-4" />}
              label="Purpose"
              value={
                <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                  {request.purpose}
                </p>
              }
              className="sm:col-span-2"
            />
          )}
          {request.items.length > 0 && (
            <div className="sm:col-span-2">
              <div className="mb-2 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-slate-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Line Items ({request.items.length})
                </p>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-semibold text-slate-600">Description</th>
                      <th className="px-3 py-1.5 text-right font-semibold text-slate-600">Qty</th>
                      <th className="px-3 py-1.5 text-right font-semibold text-slate-600">Unit Cost</th>
                      <th className="px-3 py-1.5 text-right font-semibold text-slate-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.items.map((item, i) => (
                      <tr key={item.id ?? i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">{item.description}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">
                          {item.quantity?.toString() ?? '—'}{item.unit ? ` ${item.unit}` : ''}
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-700">
                          {item.unitCost != null ? peso(item.unitCost) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-900">
                          {item.lineTotal != null ? peso(item.lineTotal) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {(request.attachments.length > 0 || canAddAttachments) && (
            <div className="sm:col-span-2">
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Paperclip className="h-3.5 w-3.5" />
                Attachments ({request.attachments.length})
              </p>
              {request.attachments.length > 0 && (
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {request.attachments.map(a => (
                    <li key={a.id}>
                      <a
                        href={a.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-2.5 py-2 hover:bg-slate-50"
                      >
                        <span className="truncate">{a.fileName}</span>
                        <Download className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {canAddAttachments && (
                <BudgetReqAttachmentUploader requisitionId={request.id} count={request.attachments.length} />
              )}
            </div>
          )}
        </>
      }
      actionsSlot={
        request.status === 'PENDING'
          ? (
              <BudgetReqActionButtons
                id={request.id}
                title={request.title}
                amount={peso(request.totalAmount)}
                canAct={canAct}
                disabledReason={actionDisabledReason}
              />
            )
          : undefined
      }
    />
  )
}
