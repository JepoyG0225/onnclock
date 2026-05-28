'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import { EmployeeImportModal } from './EmployeeImportModal'

export function EmployeeImportButton() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleSuccess = () => {
    router.refresh()
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-[#162d54] text-[#162d54] hover:bg-[#162d54] hover:text-white"
      >
        <Upload className="mr-2 w-4 h-4" />
        Import
      </Button>

      <EmployeeImportModal
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  )
}
