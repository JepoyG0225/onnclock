import { TodaySchedule } from '@/components/employee/TodaySchedule'
import { AttendanceHistory } from '@/components/employee/AttendanceHistory'
import { WeeklySchedule } from '@/components/employee/WeeklySchedule'
import ActivityLog from '@/components/attendance/ActivityLog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-2xl mx-auto">
      <div className="mb-4"><TodaySchedule /></div>
      <Tabs key={tab} defaultValue={tab === 'schedule' ? 'schedule' : 'history'}>
        <TabsList className="grid w-full grid-cols-3 mb-4 border border-blue-100 bg-gradient-to-r from-blue-50 to-emerald-50 p-1" aria-label="My attendance">
          <TabsTrigger className="text-blue-700 data-[state=active]:bg-blue-600 data-[state=active]:text-white" value="schedule">Schedule</TabsTrigger>
          <TabsTrigger className="text-teal-700 data-[state=active]:bg-teal-600 data-[state=active]:text-white" value="history">History</TabsTrigger>
          <TabsTrigger className="text-emerald-700 data-[state=active]:bg-emerald-600 data-[state=active]:text-white" value="activities">Activity Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule"><WeeklySchedule /></TabsContent>
        <TabsContent value="history"><AttendanceHistory /></TabsContent>
        <TabsContent value="activities"><ActivityLog readOnly /></TabsContent>
      </Tabs>
    </div>
  )
}
