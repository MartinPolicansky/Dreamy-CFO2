import { NextResponse } from 'next/server'
// ABRA REST API stub. Set ABRA_BASE_URL and ABRA_TOKEN in env. Map sales & expenses to MonthData.

export async function POST(req: Request){
  // const { dateFrom, dateTo } = await req.json()
  // TODO: Call ABRA endpoints, normalize to MonthData (revenueActual, payroll, rent, marketing, etc.).
  return NextResponse.json({ ok: true, note: 'Connect to ABRA API here.' })
}
