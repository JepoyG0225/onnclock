import { NextRequest,NextResponse } from 'next/server'
import { accountingAccess } from '@/lib/accounting/access'
import { prisma } from '@/lib/prisma'
import { listAccounts } from '@/lib/accounting/client'
export async function GET(req:NextRequest){
 const {ctx,error}=await accountingAccess();if(error)return error
 const provider=req.nextUrl.searchParams.get('provider');if(!['QUICKBOOKS','XERO'].includes(provider||''))return NextResponse.json({error:'Unsupported provider.'},{status:422})
 const c=await prisma.accountingConnection.findUnique({where:{companyId_provider:{companyId:ctx.companyId,provider:provider!}}});if(!c)return NextResponse.json({error:'Connect the provider first.'},{status:409})
 try{return NextResponse.json({accounts:await listAccounts(c.id)})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not load accounts.'},{status:502})}
}
