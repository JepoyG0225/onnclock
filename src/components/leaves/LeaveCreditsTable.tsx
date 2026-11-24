'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export type CreditRow = {
  id: string; balanceId: string | null; employeeId: string; employeeNo: string; employee: string; active: boolean; department: string
  typeId: string; type: string; convertible: boolean; typeActive: boolean
  entitled: number; carriedOver: number; used: number; pending: number; encashed: number; remaining: number
}
const days = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 2 })

export function LeaveCreditsTable({ rows, year }: { rows: CreditRow[]; year: number }) {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('all')
  const [convertibleOnly, setConvertibleOnly] = useState(false)
  const types = [...new Map(rows.filter(r => r.typeId).map(r => [r.typeId, r.type])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const filtered = rows.filter(r => (!search || `${r.employee} ${r.employeeNo} ${r.department}`.toLowerCase().includes(search.toLowerCase())) &&
    (!type || r.typeId === type) && (status === 'all' || r.active === (status === 'active')) && (!convertibleOnly || r.convertible))
  const input = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm'
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">Leave Credits</h1><p className="mt-1 text-sm text-slate-500">Review employee balances and convert eligible unused credits to cash through payroll.</p></div>
      <div className="flex gap-2"><Button variant="outline" asChild><Link href="/leaves/types">Leave Types</Link></Button><Button variant="outline" asChild><Link href="/leaves/encashments">Encashment History</Link></Button></div>
    </div>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
      <form action="/leaves/credits" className="flex items-end gap-2"><label className="text-sm">Leave year<input key={year} name="year" type="number" min="2000" max="2200" required defaultValue={year} className={`${input} mt-1 block w-28`} /></label><Button variant="outline" type="submit">View</Button></form>
      <label className="text-sm">Search<input className={`${input} mt-1 block`} placeholder="Employee, ID or department" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label className="text-sm">Leave type<select className={`${input} mt-1 block`} value={type} onChange={e => setType(e.target.value)}><option value="">All types</option>{types.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-sm">Employees<select className={`${input} mt-1 block`} value={status} onChange={e => setStatus(e.target.value)}><option value="all">All employees</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={convertibleOnly} onChange={e => setConvertibleOnly(e.target.checked)} />Convertible types only</label>
    </div>
    <p className="text-sm text-slate-500">{new Set(filtered.map(r => r.employeeId)).size} employees · Remaining = entitlement + carry-over − used − pending − encashed. All balances are in days.</p>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm">
      <thead className="bg-slate-50"><tr>{['Employee', 'Leave type', 'Entitled', 'Carry-over', 'Used', 'Pending', 'Encashed', 'Remaining', 'Action'].map(h => <th key={h} className="whitespace-nowrap px-4 py-3 text-left font-semibold">{h}</th>)}</tr></thead>
      <tbody>{filtered.map(r => <tr key={r.id} className="border-t">
        <td className="px-4 py-3"><Link href={`/employees/${r.employeeId}`} className="font-medium hover:underline">{r.employee}</Link><div className="text-xs text-slate-500">{r.employeeNo} · {r.department}{!r.active && ' · Inactive'}</div></td>
        <td className="px-4 py-3">{r.type}{r.convertible && <div className="text-xs text-emerald-700">Convertible to cash</div>}{r.balanceId && !r.typeActive && <div className="text-xs text-slate-500">Inactive leave type</div>}</td>
        {[r.entitled, r.carriedOver, r.used, r.pending, r.encashed].map((n, i) => <td key={i} className="px-4 py-3 tabular-nums">{r.balanceId ? days(n) : '—'}</td>)}
        <td className="px-4 py-3 font-semibold tabular-nums">{r.balanceId ? days(r.remaining) : '—'}</td>
        <td className="px-4 py-3 whitespace-nowrap">{r.balanceId && r.convertible && r.typeActive && r.active && r.remaining > 0
          ? <Button size="sm" asChild><Link href={`/leaves/encashments?year=${year}&balanceId=${encodeURIComponent(r.balanceId)}`}>Convert to Cash</Link></Button>
          : <span className="text-xs text-slate-500">{!r.balanceId ? 'No allocation' : !r.active || !r.typeActive ? 'Inactive' : !r.convertible ? 'Not convertible' : 'No available credits'}</span>}</td>
      </tr>)}</tbody>
    </table>{!filtered.length && <p className="p-8 text-center text-slate-500">No employees match these filters.</p>}</div>
    <p className="text-sm text-slate-500">Convert to Cash opens the approval form with the remaining days filled in. Confirm the rate, tax treatment and target draft payroll before approving.</p>
  </div>
}
