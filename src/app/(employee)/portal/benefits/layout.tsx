import { requireBenefitsAuth } from '@/lib/benefits/access'
export default async function BenefitsLayout({children}:{children:React.ReactNode}) {
 const {error} = await requireBenefitsAuth()
 if(error) { const data = await error.json(); return <div className="p-6"><h1 className="text-xl font-bold">Benefits &amp; HMO</h1><p className="mt-3">{data.error}</p></div> }
 return <>{children}</>
}
