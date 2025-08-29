import { NextResponse } from 'next/server'
// GA4 Data API stub: configure GOOGLE_APPLICATION_CREDENTIALS and GA4 propertyId.
export async function POST(req: Request){
  // const { propertyId, dateFrom, dateTo } = await req.json()
  // TODO: Use @google-analytics/data to fetch sessions/orders/AOV/CR and map to KPI model.
  return NextResponse.json({ ok: true, note: 'Hook up GA4 Data API here.' })
}
