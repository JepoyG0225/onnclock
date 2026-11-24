import type { Permission } from './permissions'

/** Additional action gates. Existing ownership, tenant and approval-step checks still apply. */
export function mutationPermissions(path: string, method: string): Permission[] | null {
  if (['GET','HEAD','OPTIONS'].includes(method.toUpperCase())) return null
  const p = path.replace(/\/+$/, '')
  const at = (prefix: string) => p === prefix || p.startsWith(prefix + '/')
  // Personal self-service uses ownership checks in its handlers.
  if (at('/api/employees/me') || at('/api/users/me')) return null
  if (at('/api/employees')) return [method === 'DELETE' && /^\/api\/employees\/[^/]+$/.test(p) ? 'employees:delete' : 'employees:write']
  if (at('/api/dtr')) return [/(?:approve|weekly-approve|approve-all)$/.test(p) ? 'dtr:approve' : 'dtr:write']
  if (p === '/api/attendance/admin-action') return ['dtr:write']
  if (p === '/api/attendance/rest-day-requests') return ['dtr:approve']
  if (at('/api/payroll')) {
    if (/\/(?:lock|unlock|disburse)$/.test(p)) return ['payroll:lock']
    if (/\/approve$/.test(p)) return ['payroll:approve']
    if (/\/approve-ot$/.test(p)) return ['overtime:approve']
    return ['payroll:write']
  }
  if (at('/api/final-pay') || at('/api/thirteenth-month')) return ['payroll:write']
  if (at('/api/overtime-requests') && method === 'DELETE') return ['overtime:approve']
  if (at('/api/cash-advance') && method === 'PATCH') return ['cashadvance:approve']
  if (/^\/api\/time-corrections\/[^/]+$/.test(p) && method === 'DELETE') return null
  if (at('/api/time-corrections') && p !== '/api/time-corrections') return ['corrections:approve']
  if (p === '/api/loans' && method === 'POST') return null
  if (at('/api/loans')) return ['loans:write']
  if (at('/api/leaves/encashments')) return ['payroll:write']
  if (at('/api/leaves/types')) return ['settings:write']
  if (at('/api/leaves') && /\/approve$/.test(p)) return ['leaves:approve']
  // Leave submission validates ownership in the handler; filing one's own leave is self-service.
  if (p === '/api/leaves' && method === 'POST') return null
  if (at('/api/overtime-requests') && /\/bulk-approve$/.test(p)) return ['overtime:approve']
  if (at('/api/time-corrections') && /\/bulk-approve$/.test(p)) return ['corrections:approve']
  if (/^\/api\/tasks\/[^/]+$/.test(p) && method === 'DELETE') return ['tasks:write','tasks:manage']
  // Individual task mutations are scoped to the author/assignee by guardTask.
  if (/^\/api\/tasks\/(?!move$|mentionable-users$)[^/]+(?:\/(?:comments|attachments|checklist|time-logs))?$/.test(p)) return null
  if (at('/api/tasks')) return ['tasks:write','tasks:manage']
  if (at('/api/task-statuses') || at('/api/task-labels')) return ['tasks:manage']
  if (at('/api/departments') || at('/api/positions')) return ['departments:write']
  if (at('/api/schedules')) return ['dtr:write','settings:write']
  if (at('/api/holidays') || at('/api/income-types')) return ['settings:write']
  if (at('/api/settings/approvers') || at('/api/settings/workflows')) return ['approvals:manage']
  if (at('/api/settings/role-permissions') || at('/api/settings/custom-roles') || at('/api/users')) return ['users:manage']
  if (at('/api/settings/storage')) return ['billing:manage']
  if (at('/api/setup-journey')) return ['settings:write']
  if (at('/api/settings')) return ['settings:write']
  const modules: [string, Permission][] = [
    ['announcements','announcements:write'],['assets','assets:manage'],['disciplinary','disciplinary:manage'],
    ['recruitment','recruitment:manage'],['onboarding','onboarding:manage'],['offboarding','offboarding:manage'],
    ['integrations','settings:write'],['biometric-devices','biometrics:manage'],
    ['office-kiosk/manage','settings:write'],['expenses/types','expenses:approve'],
  ]
  for (const [prefix, permission] of modules) if (at('/api/' + prefix)) return [permission]
  // Shared employee/admin endpoints check ownership and the requested action in their handlers.
  if (/^\/api\/performance-reviews\/[^/]+$/.test(p) && !p.endsWith('/competencies') && method === 'PATCH') return null
  if (at('/api/performance-reviews') && !/\/acknowledge$/.test(p)) return ['performance:manage']
  if (at('/api/benefits')) return ['benefits:manage']
  if (at('/api/learning/enrollments')) return ['learning:manage']
  if (p === '/api/learning' || at('/api/learning/certificate-templates') || /\/builder(?:\/image)?$/.test(p)) return ['learning:manage']
  return null
}

