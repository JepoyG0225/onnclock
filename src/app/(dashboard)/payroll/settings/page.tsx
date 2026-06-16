import PayrollIncomeTypesManager from '@/components/payroll/PayrollIncomeTypesManager'
import PayrollCycleSettingsCard from '@/components/payroll/PayrollCycleSettingsCard'

export default function PayrollSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payroll Settings</h1>
        <p className="text-gray-500 mt-1">Configure payroll cycle, cutoffs, night differential, and income options</p>
      </div>

      <PayrollCycleSettingsCard />
      <PayrollIncomeTypesManager />
    </div>
  )
}
