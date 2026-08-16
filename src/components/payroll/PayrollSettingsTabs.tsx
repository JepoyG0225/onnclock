"use client";

import { Banknote, CalendarRange, Clock3, ReceiptText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PayrollCycleSettingsCard from "./PayrollCycleSettingsCard";
import PayrollIncomeTypesManager from "./PayrollIncomeTypesManager";

const triggerClass =
  "gap-2 px-4 py-2.5 data-[state=active]:text-[var(--brand-primary)]";

export default function PayrollSettingsTabs() {
  return (
    <Tabs defaultValue="cycle" className="space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-4">
        <TabsTrigger value="cycle" className={triggerClass}>
          <CalendarRange className="h-4 w-4" /> Cycle & Cutoffs
        </TabsTrigger>
        <TabsTrigger value="attendance" className={triggerClass}>
          <Clock3 className="h-4 w-4" /> Attendance & Premiums
        </TabsTrigger>
        <TabsTrigger value="mandatory" className={triggerClass}>
          <Banknote className="h-4 w-4" /> Mandatory Deductions
        </TabsTrigger>
        <TabsTrigger value="income" className={triggerClass}>
          <ReceiptText className="h-4 w-4" /> Income Types
        </TabsTrigger>
      </TabsList>

      <TabsContent value="cycle">
        <PayrollCycleSettingsCard section="cycle" />
      </TabsContent>
      <TabsContent value="attendance">
        <PayrollCycleSettingsCard section="attendance" />
      </TabsContent>
      <TabsContent value="mandatory">
        <PayrollCycleSettingsCard section="mandatory" />
      </TabsContent>
      <TabsContent value="income">
        <PayrollIncomeTypesManager />
      </TabsContent>
    </Tabs>
  );
}
