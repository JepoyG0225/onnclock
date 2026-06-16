import { redirect } from 'next/navigation'

export default function LegacyAttendanceSettingsRedirect() {
  redirect('/attendance/settings')
}
