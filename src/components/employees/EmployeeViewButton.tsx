'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Row-level "View" action — routes to the employee detail page.
 * Sits next to EmployeeDeleteButton in the employees table.
 */
export function EmployeeViewButton({ employeeId }: { employeeId: string }) {
  return (
    <Link href={`/employees/${employeeId}`}>
      <Button variant="outline" size="sm" className="h-8 px-2">
        <Eye className="w-3.5 h-3.5 mr-1" />
        View
      </Button>
    </Link>
  )
}
