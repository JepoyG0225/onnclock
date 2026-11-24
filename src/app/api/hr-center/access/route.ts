import { NextResponse } from 'next/server'
import { hrAccess } from '@/lib/hr-center/access'
export async function GET(){const a=await hrAccess();if(a.error)return a.error;return NextResponse.json({kinds:a.kinds,payroll:a.granted.includes('payroll:read'),employee:!!a.employeeId},{headers:{'Cache-Control':'private, no-store'}})}
