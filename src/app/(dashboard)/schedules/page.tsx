'use client'

/**
 * Schedules — work shifts and the holiday calendar.
 *
 * Merged because they answer the same question from two directions: "when is
 * this person expected to work?" Holidays are the exceptions to the shift
 * pattern, so keeping them a click apart made people bounce between two
 * sidebar entries to reason about one week.
 */
import { Calendar, CalendarDays } from 'lucide-react'
import { TabbedPage } from '@/components/layout/TabbedPage'
import { ShiftsTab } from '@/components/schedules/ShiftsTab'
import { HolidaysTab } from '@/components/schedules/HolidaysTab'

export default function SchedulesPage() {
  return (
    <TabbedPage
      basePath="/schedules"
      tabs={[
        { id: 'shifts',   label: 'Work Schedules', icon: Calendar,     render: () => <ShiftsTab /> },
        { id: 'holidays', label: 'Holidays',       icon: CalendarDays, render: () => <HolidaysTab /> },
      ]}
    />
  )
}
