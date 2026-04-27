'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

type Mode = 'FIXED' | 'FLEXIBLE'

export function EmployeeScheduleSetup({
  employeeId,
  defaultMode,
}: {
  employeeId: string
  defaultMode?: Mode
}) {
  const router = useRouter()
  const initialMode = useMemo<Mode>(() => {
    return defaultMode === 'FLEXIBLE' ? 'FLEXIBLE' : 'FIXED'
  }, [defaultMode])
  const [mode, setMode] = useState<Mode>(initialMode)

  function goToScheduleSetup() {
    const params = new URLSearchParams({
      mode,
      employeeId,
    })
    router.push(`/schedules?${params.toString()}`)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1.5">Work Schedule Mode</label>
        <select
          value={mode}
          onChange={e => setMode(e.target.value as Mode)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          <option value="FIXED">Fixed Work Hours</option>
          <option value="FLEXIBLE">Flexible Work Hours</option>
        </select>
      </div>
      <Button className="text-white" style={{ background: '#fa5e01' }} onClick={goToScheduleSetup}>
        Setup Work Schedule
      </Button>
    </div>
  )
}

