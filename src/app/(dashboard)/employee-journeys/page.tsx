import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { getHrisProEnabled } from '@/lib/hris-pro-access'
import { HrisProGate } from '@/components/layout/HrisProGate'
import { EmployeeJourneysHub } from '@/components/onboarding/EmployeeJourneysHub'
export default async function Page(){
 const {ctx,error}=await requireAuth();if(error)redirect('/login')
 const [canOnboard,canOffboard,enabled]=await Promise.all([ctxHasPermission(ctx,'onboarding:manage'),ctxHasPermission(ctx,'offboarding:manage'),getHrisProEnabled()])
 if(!canOnboard&&!canOffboard)redirect('/settings/profile')
 return <HrisProGate enabled={enabled} featureName="Employee Journeys"><EmployeeJourneysHub canOnboard={canOnboard} canOffboard={canOffboard}/></HrisProGate>
}
