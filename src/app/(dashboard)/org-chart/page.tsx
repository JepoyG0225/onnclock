'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Building2 } from 'lucide-react'
import { OrgChart } from 'd3-org-chart'
import * as d3 from 'd3'

interface OrgEmployee {
  id: string
  employeeNo: string
  firstName: string
  lastName: string
  photoUrl: string | null
  directManagerId: string | null
  position: { title: string } | null
  department: { name: string } | null
}

type OrgNode = {
  id: string
  parentId: string | null
  name: string
  position: string
  department: string
  employeeNo: string
  photoUrl: string | null
  initials: string
  accent: string
  isDept?: boolean
  isRoot?: boolean
}

export default function DepartmentsPage() {
  const [employees, setEmployees] = useState<OrgEmployee[]>([])
  const [loading, setLoading] = useState(false)
  const chartRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/employees?org=1')
      const data = await res.json().catch(() => ({}))
      setEmployees(data.employees ?? [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const data = useMemo<OrgNode[]>(() => {
    const base = employees.map(e => {
      const dept = e.department?.name || 'Unassigned'
      return {
        id: e.id,
        parentId: e.directManagerId || null,
        name: `${e.firstName} ${e.lastName}`,
        position: e.position?.title || 'Unassigned position',
        department: dept,
        employeeNo: e.employeeNo,
        photoUrl: e.photoUrl,
        initials: `${e.firstName?.[0] || ''}${e.lastName?.[0] || ''}`,
        accent: deptColor(dept),
        isDept: false,
      }
    })

    const employeeIds = new Set(base.map(node => node.id))
    const normalized = base.map(node => ({
      ...node,
      parentId:
        node.parentId && employeeIds.has(node.parentId) && node.parentId !== node.id
          ? node.parentId
          : null,
    }))

    const rootId = '__company_root__'
    const rootNode: OrgNode = {
      id: rootId,
      parentId: null,
      name: 'Company',
      position: '',
      department: 'Company',
      employeeNo: '',
      photoUrl: null,
      initials: '',
      accent: '#2E4156',
      isDept: true,
      isRoot: true,
    }

    const byParent = new Map<string, OrgNode[]>()
    normalized.forEach(node => {
      const key = node.parentId || rootId
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(node)
    })

    const result: OrgNode[] = [rootNode, ...normalized]
    byParent.forEach((children, parentKey) => {
      const groups = new Map<string, OrgNode[]>()
      children.forEach(child => {
        const key = child.department || 'Unassigned'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(child)
      })
      groups.forEach((groupChildren, deptName) => {
        const deptId = `dept-${parentKey}-${slugify(deptName)}`
        result.push({
          id: deptId,
          parentId: parentKey,
          name: deptName,
          position: '',
          department: deptName,
          employeeNo: '',
          photoUrl: null,
          initials: '',
          accent: deptColor(deptName),
          isDept: true,
        })
        groupChildren.forEach(child => {
          child.parentId = deptId
        })
      })
    })

    return result
  }, [employees])

  useEffect(() => {
    if (!containerRef.current) return
    if (!chartRef.current) {
      chartRef.current = new OrgChart()
    }

    const chart = chartRef.current
    const width = containerRef.current.clientWidth

    chart
      .container(containerRef.current)
      .data(data)
      .nodeWidth((d: any) => (d.data.isDept ? 200 : 260))
      .nodeHeight((d: any) => (d.data.isDept ? 60 : 190))
      .childrenMargin((d: any) => {
        if (d.depth === 0) return 20
        return d.data.isDept ? 60 : 40
      })
      .siblingsMargin(() => 60)
      .compact(false)
      .linkYOffset(0)
      .nodeButtonWidth(() => 0)
      .nodeButtonHeight(() => 0)
      .nodeButtonX(() => 0)
      .nodeButtonY(() => 0)
      .buttonContent(() => ``)
      .initialZoom(0.9)
      .nodeContent((d: any) => nodeContent(d))
      .linkUpdate(function updateLink(this: SVGPathElement, d: any) {
        d3.select(this)
          .attr('stroke', '#cfd6e3')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '0')
          .attr('stroke-linecap', 'round')
          .attr('fill', 'none')
      })
      .render()

    chart.expandAll()
    chart.fit({ animate: false })
  }, [data])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Org Chart</h1>
          <p className="text-gray-500 text-sm mt-1">Visualize reporting lines using employee "Reports To"</p>
        </div>
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Loading...</div>
      ) : employees.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-400">
            No employees yet. Add employees and set "Reports To" to build the chart.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#2E4156]" /> Company Org Chart
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="org-chart-d3" ref={containerRef} />
          </CardContent>
        </Card>
      )}

      <style jsx global>{`
        .org-chart-d3 {
          width: 100%;
          min-height: 780px;
          background: linear-gradient(180deg, #f3f4f7 0%, #eef0f3 100%);
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          overflow: hidden;
        }
        .org-chart-d3 .node foreignObject {
          overflow: visible;
        }
      `}</style>
    </div>
  )
}

function nodeContent(d: { data: OrgNode & { _directSubordinates?: number } }) {
  const { name, position, department, employeeNo, photoUrl, initials, accent, isDept, _directSubordinates } = d.data
  const hasChildren = !!_directSubordinates && _directSubordinates > 0
  const avatar = photoUrl
    ? `<div style="width:48px;height:48px;border-radius:999px;overflow:hidden;flex:0 0 48px;display:block;">
         <img src="${photoUrl}" style="width:48px;height:48px;object-fit:cover;display:block;border-radius:999px;" />
       </div>`
    : `<div style="width:48px;height:48px;border-radius:999px;background:#eef2ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-weight:700;flex:0 0 48px;">${initials}</div>`

  if (isDept) {
    const len = department.length
    const fontSize = len <= 14 ? 12 : len <= 22 ? 11 : len <= 30 ? 10 : 9
    return `
      <div style="width:200px;height:70px;display:flex;align-items:center;justify-content:center;font-family:Montserrat, sans-serif;position:relative;">
        <div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:#cfd6e3;transform:translateX(-50%);"></div>
        <div style="width:176px;display:flex;align-items:center;justify-content:center;padding:6px 14px;border-radius:999px;font-size:${fontSize}px;font-weight:700;letter-spacing:0.03em;line-height:1.3;color:white;background:${accent};box-shadow:0 6px 12px rgba(15,23,42,0.12);position:relative;z-index:1;text-align:center;word-break:break-word;">
          ${department}
        </div>
      </div>
    `
  }

  return `
    <div style="width:260px;height:190px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;font-family:Montserrat, sans-serif;">
      <div style="position:relative;width:220px;background:white;border:1px solid #e5e7eb;border-top:4px solid ${accent};border-radius:16px;box-shadow:0 10px 18px rgba(15,23,42,0.08);padding:44px 16px 14px;text-align:center;">
        <div style="position:absolute;top:-24px;left:50%;transform:translateX(-50%);width:48px;height:48px;border-radius:999px;border:3px solid white;box-shadow:0 8px 16px rgba(15,23,42,0.15);background:white;display:flex;align-items:center;justify-content:center;">${avatar}</div>
        <div style="font-weight:800;color:#1f2a44;margin-top:2px;">${name}</div>
        <div style="font-size:12px;color:#6b7280;">${position}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:6px;">
          <span style="border:1px solid #d8dee9;border-radius:999px;padding:2px 8px;display:inline-block;">${employeeNo}</span>
        </div>
      </div>
      ${hasChildren ? `<div style="height:76px;border-left:1px solid #cfd6e3;transform:translateX(-0.5px);"></div>` : ``}
    </div>
  `
}

function deptColor(name: string) {
  const key = name.toLowerCase()
  const palette = [
    '#A78BFA',
    '#F4A261',
    '#84C5A7',
    '#60A5FA',
    '#F59E0B',
    '#F472B6',
  ]
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % palette.length
  return palette[hash]
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

