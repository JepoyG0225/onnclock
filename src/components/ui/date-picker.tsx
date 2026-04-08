'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { format, parseISO, isValid } from 'date-fns'

interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  placeholder = 'Select date',
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  const selected = value ? parseISO(value) : undefined
  const selectedLabel = selected && isValid(selected) ? format(selected, 'MMM d, yyyy') : placeholder

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleTouchOutside(e: TouchEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleTouchOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleTouchOutside)
    }
  }, [])

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white hover:bg-gray-50 disabled:opacity-50"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>{selectedLabel}</span>
        <CalendarDays className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="w-[min(92vw,280px)] rounded-2xl border border-border bg-popover p-3 text-foreground shadow-xl">
          <DayPicker
            mode="single"
            captionLayout="dropdown-years"
            navLayout="around"
            selected={selected}
              onSelect={(day) => {
                if (!day) return
                onChange(format(day, 'yyyy-MM-dd'))
                setOpen(false)
              }}
            fromDate={min ? parseISO(min) : undefined}
            toDate={max ? parseISO(max) : undefined}
            fromYear={min ? parseISO(min).getFullYear() : 1950}
            toYear={max ? parseISO(max).getFullYear() : new Date().getFullYear() + 50}
            disabled={[
              ...(min ? [{ before: parseISO(min) }] : []),
              ...(max ? [{ after: parseISO(max) }] : []),
            ]}
            classNames={{
                months: 'flex flex-col',
                month: 'relative space-y-3',
                month_caption: 'flex flex-col items-center justify-center px-2 pt-1 gap-1.5',
                caption_label: 'text-sm font-semibold text-foreground',
                dropdowns: 'flex items-center gap-2',
                dropdown: 'h-8 rounded-md border border-gray-300 bg-white px-2 text-sm',
                nav: 'flex items-center gap-2',
                button_previous:
                  'absolute left-2 top-1 h-7 w-7 rounded-full text-foreground/80 hover:bg-muted hover:text-foreground flex items-center justify-center',
                button_next:
                  'absolute right-2 top-1 h-7 w-7 rounded-full text-foreground/80 hover:bg-muted hover:text-foreground flex items-center justify-center',
                month_grid: 'w-full',
                weekdays: 'flex',
                weekday: 'text-[11px] text-muted-foreground w-9 text-center',
                weeks: 'flex flex-col mt-1',
                week: 'flex w-full',
                day: 'h-9 w-9 p-0 text-center text-sm rounded-full flex items-center justify-center',
                day_button:
                  'h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected: 'bg-primary text-primary-foreground',
                today: 'border border-ring/40',
                outside: 'text-muted-foreground/40',
                disabled: 'text-muted-foreground/50 opacity-60',
              }}
            formatters={{
              formatCaption: (month) => format(month, 'MMMM'),
            }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
