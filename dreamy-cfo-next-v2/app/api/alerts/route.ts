import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(){
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('Unauthorized', { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  const months = await prisma.monthData.findMany({ where: { userId: user!.id }, orderBy: { month: 'asc' } })
  const cf = await prisma.cashflow.findMany({ where: { userId: user!.id }, orderBy: { month: 'asc' } })
  const alerts: string[] = []

  // 3x za sebou záporná EBITDA (plán)
  let streak = 0
  for (const m of months){
    const opex = m.payroll + m.rent + m.marketing + m.fulfillment + m.itAdmin + m.otherOpex
    const ebitda = m.revenuePlan - opex
    if (ebitda < 0) streak += 1; else streak = 0
    if (streak >= 3){ alerts.push('EBITDA plán je 3 měsíce po sobě negativní. Zvaž optimalizaci fixních nákladů nebo navýšení výkonu.') ; break }
  }

  // Runway
  const last = cf[cf.length-1]
  if (last){
    const burn = Math.max(0, (last.cashOut - last.cashIn))
    if (burn > 0){
      const runway = Math.round((last.endingCash || 0) / burn * 10) / 10
      if (runway < 6) alerts.push(`Cash runway je ${runway} měsíců. Zvaž financování / snížení burn rate.`)
    }
  }
  return NextResponse.json({ alerts })
}
