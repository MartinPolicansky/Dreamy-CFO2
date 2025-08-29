'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function SignUpPage(){
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent){
    e.preventDefault()
    setStatus(null)
    const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, name, password }) })
    if (res.ok){ setStatus('Účet vytvořen. Můžeš se přihlásit.'); }
    else { const t = await res.text(); setStatus(t || 'Něco se nepovedlo'); }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={onSubmit} className="max-w-sm w-full space-y-4 bg-white p-6 rounded shadow">
        <h1 className="text-xl font-semibold">Vytvořit účet</h1>
        <input className="w-full border rounded p-2" placeholder="Jméno (volitelné)" value={name} onChange={e=>setName(e.target.value)} />
        <input className="w-full border rounded p-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full border rounded p-2" type="password" placeholder="Heslo" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="w-full bg-black text-white rounded p-2">Zaregistrovat</button>
        {status && <div className="text-sm text-center">{status}</div>}
        <div className="text-sm text-center">Máte účet? <Link className="underline" href="/sign-in">Přihlaste se</Link></div>
      </form>
    </main>
  )
}
