import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Download, Building, Receipt } from 'lucide-react'

const REPORTS = [
  {
    category: 'SSS',
    color: 'bg-[#2E4156]',
    reports: [
      {
        title: 'SSS R3 — Contribution Collection List',
        description: 'Monthly SSS contributions (employee + employer + EC) in SSS-prescribed format',
        href: '/reports/sss',
        formats: ['XLSX', 'CSV'],
      },
    ],
  },
  {
    category: 'PhilHealth',
    color: 'bg-green-600',
    reports: [
      {
        title: 'RF-1 — Premium Remittance Return',
        description: 'Monthly PhilHealth premium contributions per employee',
        href: '/reports/philhealth',
        formats: ['XLSX'],
      },
    ],
  },
  {
    category: 'Pag-IBIG / HDMF',
    color: 'bg-yellow-600',
    reports: [
      {
        title: 'MCRF — Modified Collection and Remittance Form',
        description: 'Monthly Pag-IBIG contributions (employee + employer)',
        href: '/reports/pagibig',
        formats: ['XLSX'],
      },
    ],
  },
  {
    category: 'BIR',
    color: 'bg-red-600',
    reports: [
      {
        title: '1601C — Monthly Remittance Return of Income Taxes Withheld',
        description: 'Monthly withholding tax remittance form',
        href: '/reports/bir',
        formats: ['PDF', 'XLSX'],
      },
      {
        title: 'Form 2316 — Certificate of Compensation',
        description: 'Annual tax certificate per employee (BIR Form 2316)',
        href: '/reports/bir?type=2316',
        formats: ['PDF'],
      },
      {
        title: '1604CF — Alphalist of Employees',
        description: 'Annual Alphalist of employees with compensation and taxes',
        href: '/reports/bir?type=alphalist',
        formats: ['XLSX'],
      },
    ],
  },
  {
    category: 'Payroll Reports',
    color: 'bg-purple-600',
    reports: [
      {
        title: 'Payroll Register',
        description: 'Full payroll summary per employee for any period',
        href: '/reports/bir?type=register',
        formats: ['XLSX', 'PDF'],
      },
      {
        title: '13th Month Pay Summary',
        description: 'Year-end 13th month pay computation summary',
        href: '/reports/bir?type=13thmonth',
        formats: ['XLSX'],
      },
    ],
  },
]

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Government Reports</h1>
        <p className="text-gray-500 mt-1">Generate DOLE, SSS, PhilHealth, Pag-IBIG, and BIR compliance reports</p>
      </div>

      <div className="space-y-6">
        {REPORTS.map((section) => (
          <div key={section.category}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-3 h-3 rounded-full ${section.color}`} />
              <h2 className="font-semibold text-gray-800">{section.category}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {section.reports.map((report) => (
                <Link key={report.href} href={report.href}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer border border-gray-200 hover:border-[#AAB7B7]">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            <p className="font-medium text-sm text-gray-900">{report.title}</p>
                          </div>
                          <p className="text-xs text-gray-500 ml-6">{report.description}</p>
                          <div className="flex gap-1.5 mt-2 ml-6">
                            {report.formats.map(f => (
                              <Badge key={f} variant="outline" className="text-xs px-2 py-0">
                                {f}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <Download className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Remittance Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            Remittance Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-semibold text-[#1A2D42]">SSS</p>
              <p className="text-gray-600">Last working day of the following month</p>
              <p className="text-xs text-gray-400">e.g., January contributions → Feb 28/29</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-green-700">PhilHealth</p>
              <p className="text-gray-600">Last working day of the following month</p>
              <p className="text-xs text-gray-400">Employer files RF-1 to PhilHealth office</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-red-700">Pag-IBIG & BIR</p>
              <p className="text-gray-600">10th of the following month</p>
              <p className="text-xs text-gray-400">BIR 1601C monthly withholding remittance</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

