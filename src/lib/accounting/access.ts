import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { requireHrisProOrTrialApi } from '@/lib/hris-pro'
export async function accountingAccess(write=false) {
 const auth=await requireAuth();if(auth.error)return auth
 const error=await requireHrisProOrTrialApi(auth.ctx.companyId);if(error)return {ctx:null,error}
 const permissions=write?['settings:write','payroll:write']:['settings:write','payroll:read']
 const allowed=await Promise.all(permissions.map(p=>ctxHasPermission(auth.ctx,p as 'settings:write'|'payroll:read'|'payroll:write')))
 if(!allowed.some(Boolean))return {ctx:null,error:NextResponse.json({error:'Accounting access is required.'},{status:403})}
 return auth
}
