import { ROLE_LABELS, type UserRole } from '@/lib/auth/permissions'

/** Shared selection values keep default and company custom roles distinct. */
export function RoleOptions({ defaults, custom }: { defaults: UserRole[]; custom: Array<{ id: string; name: string }> }) {
  return <>{defaults.map(role => <option key={role} value={role}>{ROLE_LABELS[role]} (Default)</option>)}{custom.map(role => <option key={role.id} value={`custom:${role.id}`}>{role.name} (Custom)</option>)}</>
}
