import { TodaySchedule } from '@/components/employee/TodaySchedule'
import { AttendanceHistory } from '@/components/employee/AttendanceHistory'
import { WeeklySchedule } from '@/components/employee/WeeklySchedule'
import ActivityLog from '@/components/attendance/ActivityLog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-6xl mx-auto">
      <header className="mb-5"><h1 className="text-2xl font-semibold text-[#162d54]">My attendance</h1><p className="mt-1 text-sm text-slate-500">Your schedule, time records, and daily activities.</p></header>
      <div className="mb-4"><TodaySchedule /></div>
      <Tabs key={tab} defaultValue={tab === 'schedule' ? 'schedule' : 'history'}>
        <TabsList className="grid w-full grid-cols-3 mb-4 border border-slate-200 bg-white p-1" aria-label="My attendance">
          <TabsTrigger className="text-slate-600 data-[state=active]:bg-[#ff5900] data-[state=active]:text-white" value="schedule">Schedule</TabsTrigger>
          <TabsTrigger className="text-slate-600 data-[state=active]:bg-[#ff5900] data-[state=active]:text-white" value="history">History</TabsTrigger>
          <TabsTrigger className="text-slate-600 data-[state=active]:bg-[#ff5900] data-[state=active]:text-white" value="activities">Activity Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule"><WeeklySchedule /></TabsContent>
        <TabsContent value="history"><AttendanceHistory /></TabsContent>
        <TabsContent value="activities"><ActivityLog readOnly /></TabsContent>
      </Tabs>
    </div>
  )
}
