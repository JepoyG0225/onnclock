import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
export async function GET(){const a=await requireAuth();if(a.error)return a.error;return NextResponse.json({enabled:false,employees:[]})}
export async function PATCH(){const a=await requireAuth();if(a.error)return a.error;return NextResponse.json({error:'Self-scheduling has been removed. Administrators manage employee schedules.'},{status:410})}
