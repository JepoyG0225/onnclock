import { NextResponse } from 'next/server'

export async function GET() { return NextResponse.json({ error: 'The disbursement module has been removed. Record payroll payment in Payroll Runs.' }, { status: 410 }) }
