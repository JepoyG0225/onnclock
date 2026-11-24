import { accountingAccess } from '@/lib/accounting/access'
export default async function IntegrationsLayout({children}:{children:React.ReactNode}){
 const {error}=await accountingAccess()
 if(error){const data=await error.json();return <div className="p-6"><h1 className="text-xl font-bold">Business Integrations</h1><p className="mt-3">{data.error}</p></div>}
 return <>{children}</>
}
