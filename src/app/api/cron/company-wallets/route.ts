import { NextResponse } from 'next/server'
export async function GET() { return NextResponse.json({ error: 'Disbursement module retired' }, { status: 410 }) }
