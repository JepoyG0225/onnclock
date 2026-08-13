/**
 * My Attendance — the employee's daily time records.
 *
 * No punch control and no location card here any more: the home screen carries
 * the punch (it renders PunchClock directly), so repeating it here gave two
 * places to clock in and pushed the records themselves below the fold. This
 * page is now only the record.
 */
import { AttendanceHistory } from '@/components/employee/AttendanceHistory'

export default function MyAttendancePage() {
  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-2xl mx-auto">
      <AttendanceHistory />
    </div>
  )
}
