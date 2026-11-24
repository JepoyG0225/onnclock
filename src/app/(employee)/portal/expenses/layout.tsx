import { expenseAccess } from '@/lib/expenses/access'
export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
 const { error } = await expenseAccess()
 if (error) { const body = await error.json(); return <div className="p-6"><h1 className="text-xl font-bold">Expense Claims</h1><p className="mt-3">{body.error}</p></div> }
 return <>{children}</>
}
