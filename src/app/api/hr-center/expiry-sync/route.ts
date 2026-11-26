import {NextResponse} from 'next/server'
import {requireAuth} from '@/lib/api-auth'
import {ctxHasPermission} from '@/lib/auth/effective-permissions'
import {syncExpiryRecords} from '@/lib/hr-center/expiry'
export async function POST(){const {ctx,error}=await requireAuth();if(error)return error;if(!await ctxHasPermission(ctx,'documents:manage'))return NextResponse.json({error:'Document management permission required.'},{status:403});return NextResponse.json({created:await syncExpiryRecords(ctx.companyId)})}
