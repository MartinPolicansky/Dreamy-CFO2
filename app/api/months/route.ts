import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
export async function GET(){
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('Unauthorized', { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  const rows = await prisma.monthData.findMany({ where: { userId: user!.id }, orderBy: { month: 'asc' } })
  return NextResponse.json(rows)
}

export async function POST(req: Request){
  const session = await auth()
  if (!session?.user?.email) return new NextResponse('Unauthorized', { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  const body = await req.json()
  const created = await prisma.monthData.upsert({
    where: { userId_month: { userId: user!.id, month: body.month } },
    update: body,
    create: { ...body, userId: user!.id },
  })
  return NextResponse.json(created)
}
