import { auth } from '@/lib/auth'
import Link from 'next/link'

export default async function Home() {
  const session = await auth()
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-xl w-full space-y-4">
        <h1 className="text-3xl font-semibold">Dreamy CFO Dashboard</h1>
        <p className="text-gray-600">Přihlas se a spravuj svá finanční data.</p>
        <div className="flex gap-3">
          {session ? (
            <Link href="/dashboard" className="px-4 py-2 rounded bg-black text-white">Otevřít dashboard</Link>
          ) : (
            <>
              <Link href="/sign-in" className="px-4 py-2 rounded bg-black text-white">Přihlásit</Link>
              <Link href="/sign-up" className="px-4 py-2 rounded border">Vytvořit účet</Link>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
