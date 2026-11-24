import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardList, Receipt } from 'lucide-react'
import { auth } from '@/lib/auth'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import BudgetRequisitionsTab from '@/components/budget/BudgetRequisitionsTab'
import { ExpensesClient } from '@/components/expenses/ExpensesClient'
import { getHrisProEnabled } from '@/lib/hris-pro-access'
import { HrisProGate } from '@/components/layout/HrisProGate'
export default async function Page({searchParams}:{searchParams:Promise<{tab?:string;status?:string;q?:string}>}){
 const params=await searchParams,session=await auth();if(!session?.user)redirect('/login')
 const companyId=await resolveEffectiveCompanyId(session.user);if(!companyId)redirect('/login')
 const permissions=await getEffectivePermissions(session.user.role,companyId,session.user.id)
 const budget=['budget:read','budget:approve','payroll:read','employees:read'].some(p=>permissions.includes(p as never)),expenses=['expenses:read','expenses:approve'].some(p=>permissions.includes(p as never))
 if(!budget&&!expenses)return <p>You do not have access to requisitions or expense claims.</p>
 const tab=params.tab==='expenses'&&expenses?'expenses':budget?'budget':'expenses'
 const enabled=await getHrisProEnabled()
 return <HrisProGate enabled={enabled} featureName="Requisitions and Expense Claims"><div className="min-w-0 space-y-5"><div><h1 className="text-2xl font-bold tracking-tight text-primary">Requisitions and Expense Claims</h1><p className="mt-1 text-sm text-slate-500">Review budget requests and manage employee reimbursements in one place.</p></div><nav aria-label="Requisitions and expense tabs" className="flex gap-1 overflow-x-auto border-b pb-1">{budget&&<Link href="/requisitions?tab=budget" aria-current={tab==='budget'?'page':undefined} data-app-tab data-active={tab==='budget'} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab==='budget'?'bg-accent text-white':'text-slate-500 hover:bg-slate-50'}`}><ClipboardList className="h-4 w-4"/>Budget Requisitions</Link>}{expenses&&<Link href="/requisitions?tab=expenses" aria-current={tab==='expenses'?'page':undefined} data-app-tab data-active={tab==='expenses'} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab==='expenses'?'bg-accent text-white':'text-slate-500 hover:bg-slate-50'}`}><Receipt className="h-4 w-4"/>Expense Claims</Link>}</nav>{tab==='budget'?<BudgetRequisitionsTab searchParams={Promise.resolve(params)}/>:<ExpensesClient embedded/>}</div></HrisProGate>
}
