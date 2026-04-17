'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { UserX, UserCheck } from 'lucide-react'

interface Props {
  employeeId: string
  isActive: boolean
  employeeName: string
}

export function EmployeeStatusButton({ employeeId, isActive, employeeName }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const portalTarget = typeof document !== 'undefined' ? document.body : null

  async function handleToggle() {
    setLoading(true)
    try {
      let res: Response
      if (isActive) {
        // Deactivate - soft delete
        res = await fetch(`/api/employees/${employeeId}`, { method: 'DELETE' })
      } else {
        // Reactivate - PATCH isActive: true
        res = await fetch(`/api/employees/${employeeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: true }),
        })
      }
      if (res.ok) {
        toast.success(isActive ? 'Employee deactivated' : 'Employee reactivated')
        setOpen(false)
        router.refresh()
      } else {
        toast.error('Action failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {isActive ? (
        <Button
          size="sm"
          variant="outline"
          className="border-orange-300 text-orange-700 hover:bg-orange-50"
          onClick={() => setOpen(true)}
        >
          <UserX className="w-3.5 h-3.5 mr-1" />
          Deactivate
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="border-green-300 text-green-700 hover:bg-green-50"
          onClick={() => setOpen(true)}
        >
          <UserCheck className="w-3.5 h-3.5 mr-1" />
          Reactivate
        </Button>
      )}

      {open && portalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <Card className="relative w-full max-w-sm shadow-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {isActive ? (
                  <><UserX className="w-4 h-4 text-orange-600" /> Deactivate Employee</>
                ) : (
                  <><UserCheck className="w-4 h-4 text-green-600" /> Reactivate Employee</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                {isActive
                  ? <>Are you sure you want to deactivate <strong>{employeeName}</strong>? They will be excluded from payroll and portal access will be revoked.</>
                  : <>Are you sure you want to reactivate <strong>{employeeName}</strong>? They will be included in payroll again.</>
                }
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={loading}>
                  Cancel
                </Button>
                {loading ? (
                  <div
                    className="flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium"
                    style={isActive
                      ? { background: '#ea580c', color: 'white' }
                      : { background: '#16a34a', color: 'white' }
                    }
                  >
                    Please wait...
                  </div>
                ) : (
                  <Button
                    className="flex-1"
                    style={isActive
                      ? { background: '#ea580c', color: 'white' }
                      : { background: '#16a34a', color: 'white' }
                    }
                    onClick={handleToggle}
                  >
                    {isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>,
        portalTarget
      )}
    </>
  )
}
