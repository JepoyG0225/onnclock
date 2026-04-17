export const CHAT_MESSAGE_ENTITY = 'CHAT_MESSAGE'
export const CHAT_PRESENCE_ENTITY = 'CHAT_PRESENCE'
export const CHAT_READ_ENTITY = 'CHAT_READ'
export const CHAT_GROUP_MESSAGE_ENTITY = 'CHAT_GROUP_MESSAGE'
export const CHAT_GROUP_READ_ENTITY = 'CHAT_GROUP_READ'

export const ADMIN_CHAT_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'] as const

export function isAdminChatRole(role: string): boolean {
  return ADMIN_CHAT_ROLES.includes(role as (typeof ADMIN_CHAT_ROLES)[number])
}

export function conversationId(companyId: string, aUserId: string, bUserId: string): string {
  const [a, b] = [aUserId, bUserId].sort()
  return `chat:${companyId}:${a}:${b}`
}

export function groupMessageEntityId(groupId: string): string {
  return `grp:${groupId}`
}

export function groupReadEntityId(groupId: string, userId: string): string {
  return `grpread:${groupId}:${userId}`
}

export function safeMessageBody(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text.slice(0, 2000)
}
