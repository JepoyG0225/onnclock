import PayrollSettingsTabs from "@/components/payroll/PayrollSettingsTabs";

export default function PayrollSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payroll Settings</h1>
        <p className="text-gray-500 mt-1">
          Configure payroll schedules, attendance rules, statutory deductions,
          and earnings
        </p>
      </div>

      <PayrollSettingsTabs />
    </div>
  );
}
