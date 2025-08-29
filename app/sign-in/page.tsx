'use client'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useState } from 'react'

export default function SignInPage(){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent){
    e.preventDefault()
    setErr(null)
    const res = await signIn('credentials', { redirect: false, email, password })
    if (res?.error) setErr('Neplatné přihlašovací údaje')
    else window.location.href = '/dashboard'
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={onSubmit} className="max-w-sm w-full space-y-4 bg-white p-6 rounded shadow">
        <h1 className="text-xl font-semibold">Přihlášení</h1>
        <input className="w-full border rounded p-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full border rounded p-2" type="password" placeholder="Heslo" value={password} onChange={e=>setPassword(e.target.value)} />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="w-full bg-black text-white rounded p-2">Přihlásit</button>
        <div className="text-sm text-center">Nemáš účet? <Link className="underline" href="/sign-up">Zaregistrovat</Link></div>
      </form>
    </main>
  )
}
