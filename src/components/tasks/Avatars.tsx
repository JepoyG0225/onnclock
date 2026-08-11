'use client'

import { cn } from '@/lib/utils'
import { avatarTint, fullName, initialsOf, type EmployeeBrief } from './types'

export function EmployeeAvatar({
  employee,
  size = 'sm',
  className,
}: {
  employee: EmployeeBrief
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  const dims = size === 'xs' ? 'h-5 w-5 text-[9px]' : size === 'md' ? 'h-9 w-9 text-xs' : 'h-7 w-7 text-[10px]'
  return (
    <span
      title={`${fullName(employee)} · ${employee.employeeNo}`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-background',
        dims,
        avatarTint(employee.id),
        className,
      )}
    >
      {initialsOf(employee)}
    </span>
  )
}

/** Overlapping avatar stack with a "+N" overflow chip. */
export function AvatarStack({
  employees,
  max = 3,
  size = 'sm',
}: {
  employees: EmployeeBrief[]
  max?: number
  size?: 'xs' | 'sm' | 'md'
}) {
  if (employees.length === 0) return null
  const shown = employees.slice(0, max)
  const overflow = employees.length - shown.length
  const dims = size === 'xs' ? 'h-5 w-5 text-[9px]' : size === 'md' ? 'h-9 w-9 text-xs' : 'h-7 w-7 text-[10px]'

  return (
    <div className="flex -space-x-1.5">
      {shown.map(e => (
        <EmployeeAvatar key={e.id} employee={e} size={size} />
      ))}
      {overflow > 0 && (
        <span
          title={employees.slice(max).map(fullName).join(', ')}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-background',
            dims,
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
