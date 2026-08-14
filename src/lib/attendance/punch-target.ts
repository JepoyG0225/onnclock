import type { AuthContext } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'

/**
 * Which employee a punch applies to.
 *
 * Normally that is whoever is signed in. A shared kiosk has no signed-in
 * employee — it runs on one admin login and serves everyone who walks up — so
 * it names the employee explicitly after identifying their face.
 *
 * This exists so the kiosk can reuse /api/attendance/clock-in and /clock-out
 * unchanged. The alternative was a second punch implementation for the kiosk,
 * and those two would have drifted apart on exactly the rules that must not
 * drift: schedule validation, rest-day handling, late and undertime.
 *
 * Guarded two ways. The caller must hold `dtr:write`, which employees do not,
 * so a portal user cannot punch a colleague by adding an id to the body. And
 * the target must belong to the caller's company, so an admin at one tenant
 * cannot reach another's roster.
 */
export async function resolvePunchEmployeeId(
  ctx: AuthContext,
  requestedEmployeeId?: string | null,
): Promise<{ employeeId: string | null; onBehalf: boolean; forbidden?: string }> {
  if (!requestedEmployeeId) {
    return { employeeId: await resolvePortalEmployeeId(ctx), onBehalf: false }
  }

  if (!(await ctxHasPermission(ctx, 'dtr:write'))) {
    return {
      employeeId: null,
      onBehalf: false,
      forbidden: 'You cannot record attendance for another employee.',
    }
  }

  const target = await prisma.employee.findFirst({
    where: { id: requestedEmployeeId, companyId: ctx.companyId, isActive: true },
    select: { id: true },
  })
  if (!target) {
    return { employeeId: null, onBehalf: true, forbidden: 'Employee not found in this company.' }
  }

  return { employeeId: target.id, onBehalf: true }
}
