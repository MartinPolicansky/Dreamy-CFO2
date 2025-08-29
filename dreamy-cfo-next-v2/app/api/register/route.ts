import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: Request){
  const { email, name, password } = await req.json()
  if (!email || !password) return new NextResponse('Email a heslo jsou povinné', { status: 400 })
  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return new NextResponse('Uživatel už existuje', { status: 400 })
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.create({ data: { email, name, passwordHash } })
  return NextResponse.json({ ok: true })
}
