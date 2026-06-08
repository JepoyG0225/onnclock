'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus, AlertCircle, X } from 'lucide-react'

interface Props {
  atSeatCap: boolean
  activeCount: number
  paidSeats: number
}

export function AddEmployeeButton({ atSeatCap, activeCount, paidSeats }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function handleClick() {
    if (atSeatCap) {
      setOpen(true)
    } else {
      router.push('/employees/new')
    }
  }

  return (
    <>
      <Button onClick={handleClick} data-tour="add-employee">
        <Plus className="mr-2 w-4 h-4" />
        Add Employee
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 z-10">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,89,0,0.1)' }}>
                <AlertCircle className="w-7 h-7" style={{ color: '#ff5900' }} />
              </div>

              <div>
                <h2 className="text-lg font-bold" style={{ color: '#162d54' }}>
                  Seat Limit Reached
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  You&apos;ve used <span className="font-semibold text-gray-700">{activeCount} of {paidSeats}</span> paid seats.
                  Upgrade your plan to add more employees.
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full">
                <Button
                  className="w-full text-white"
                  style={{ background: '#ff5900' }}
                  onClick={() => { setOpen(false); router.push('/settings/billing') }}
                >
                  Upgrade Plan
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
