'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  payslipId: string
  employeeName: string
}

export function PayslipDownloadButton({ payslipId, employeeName }: Props) {
  const [loading, setLoading] = useState(false)

  async function download() {
    setLoading(true)
    try {
      const res = await fetch(`/api/payroll/payslip/${payslipId}/pdf`)
      if (!res.ok) { toast.error('Failed to generate payslip'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `Payslip-${employeeName}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 w-7 p-0 text-gray-400 hover:text-[#2E4156]"
      onClick={download}
      disabled={loading}
      title="Download payslip PDF"
    >
      <Download className="w-3.5 h-3.5" />
    </Button>
  )
}

