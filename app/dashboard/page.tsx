'use client'

import React, { useMemo, useState } from 'react'
import useSWR from 'swr'
import { signOut } from 'next-auth/react'
import {
  LineChart, Line, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer
} from 'recharts'
import * as XLSX from 'xlsx'
// --- Helpers pro robustní import ---
function findSheet(workbook: any, names: string[]) {
  const by = new Set(names.map(n => n.trim().toLowerCase()))
  const sheetName = (workbook.SheetNames || []).find(
    (n: string) => by.has(n.trim().toLowerCase())
  )
  return sheetName ? workbook.Sheets[sheetName] : null
}

function num(x: any): number {
  if (x == null) return 0
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0
  let s = String(x).trim()
  // Zahoď měny, text, mezery
  s = s.replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  // Pokud je jedna čárka a žádná tečka → čárka jako desetinná
  if ((s.match(/,/g) || []).length === 1 && (s.match(/\./g) || []).length === 0) {
    s = s.replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function excelSerialToDate(serial: number): Date {
  // Excel (1900-based) → JS Date (UTC)
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const dateInfo = new Date(utcValue * 1000)
  const fractional = serial - Math.floor(serial)
  const totalSeconds = Math.floor(86400 * fractional)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60
  const seconds = totalSeconds % 60
  dateInfo.setHours(hours, minutes, seconds, 0)
  return dateInfo
}

function ym(x: any): string {
  if (x == null) return ''
  if (x instanceof Date) {
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
  }
  if (typeof x === 'number' && x > 20000 && x < 60000) {
    const d = excelSerialToDate(x)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const s = String(x).trim()
  // 2025-01 nebo 2025/1
  let m = s.match(/^(\d{4})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  // 1/2025 nebo 1.2025
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/)
  if (m) return `${m[2]}-${String(m[1]).padStart(2, '0')}`
  return s.slice(0, 7)
}

function ymd(x: any): string {
  if (x == null) return ''
  if (x instanceof Date) return x.toISOString().slice(0, 10)
  if (typeof x === 'number' && x > 20000 && x < 60000) {
    return excelSerialToDate(x).toISOString().slice(0, 10)
  }
  const s = String(x).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return s.slice(0, 10)
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

function toCZK(n: number) {
  return (n || 0).toLocaleString('cs-CZ') + ' Kč'
}

/** XLSX šablona + import */
function DownloadTemplate() {
  const wb = XLSX.utils.book_new()
  const obraty = XLSX.utils.json_to_sheet([{ 'Month (YYYY-MM)': '2025-01', 'Revenue Plan CZK': '', 'Revenue Reality CZK': '' }])
  const opex = XLSX.utils.json_to_sheet([{ 'Month (YYYY-MM)': '2025-01', 'Payroll CZK': '', 'Rent CZK': '', 'Marketing CZK': '', 'Fulfillment CZK': '', 'IT/Admin CZK': '', 'Other OPEX CZK': '' }])
  const capex = XLSX.utils.json_to_sheet([{ 'Date (YYYY-MM-DD)': '2025-01-15', 'Category': '', 'Amount CZK': '', 'Comment': '' }])
  const cf = XLSX.utils.json_to_sheet([{ 'Month (YYYY-MM)': '2025-01', 'Opening Cash CZK': '', 'Cash In CZK': '', 'Cash Out CZK': '', 'Ending Cash CZK': '' }])
  const kpi = XLSX.utils.json_to_sheet([{ 'Month (YYYY-MM)': '2025-01', 'Orders': '', 'Avg Order Value CZK': '', 'Conversion Rate %': '' }])
  XLSX.utils.book_append_sheet(wb, obraty, 'Obraty')
  XLSX.utils.book_append_sheet(wb, opex, 'OPEX (Provozní náklady)')
  XLSX.utils.book_append_sheet(wb, capex, 'CAPEX')
  XLSX.utils.book_append_sheet(wb, cf, 'Cash Flow')
  XLSX.utils.book_append_sheet(wb, kpi, 'KPIs')
  XLSX.writeFile(wb, 'Dreamy_CFO_Template.xlsx')
}

async function importXLSX(file: File) {
  const data = await file.arrayBuffer()
  const wb = XLSX.read(data)

  // Obraty + OPEX -> /api/months
  const obraty = wb.Sheets['Obraty'] ? XLSX.utils.sheet_to_json(wb.Sheets['Obraty']) as any[] : []
  const opex = wb.Sheets['OPEX (Provozní náklady)'] ? XLSX.utils.sheet_to_json(wb.Sheets['OPEX (Provozní náklady)']) as any[] : []
  const map: any = {}
  for (const r of obraty) {
    const m = (r['Month (YYYY-MM)'] || '').toString().slice(0, 7)
    if (!m) continue
    map[m] = { ...(map[m] || {}), month: m, revenuePlan: +r['Revenue Plan CZK'] || 0, revenueActual: +r['Revenue Reality CZK'] || 0 }
  }
  for (const r of opex) {
    const m = (r['Month (YYYY-MM)'] || '').toString().slice(0, 7)
    if (!m) continue
    map[m] = {
      ...(map[m] || {}), month: m,
      payroll: +r['Payroll CZK'] || 0, rent: +r['Rent CZK'] || 0, marketing: +r['Marketing CZK'] || 0,
      fulfillment: +r['Fulfillment CZK'] || 0, itAdmin: +r['IT/Admin CZK'] || 0, otherOpex: +r['Other OPEX CZK'] || 0
    }
  }
  for (const key of Object.keys(map)) {
    await fetch('/api/months', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(map[key]) })
  }

  // CAPEX -> /api/capex
  const cap = wb.Sheets['CAPEX'] ? XLSX.utils.sheet_to_json(wb.Sheets['CAPEX']) as any[] : []
  for (const r of cap) {
    await fetch('/api/capex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: new Date(r['Date (YYYY-MM-DD)'] || `${(r['Date'] || '2025-01-01')}`),
        category: r['Category'] || '', amount: +r['Amount CZK'] || 0, comment: r['Comment'] || ''
      })
    })
  }

  // Cash Flow -> /api/cashflow
  const cf = wb.Sheets['Cash Flow'] ? XLSX.utils.sheet_to_json(wb.Sheets['Cash Flow']) as any[] : []
  for (const r of cf) {
    const m = (r['Month (YYYY-MM)'] || '').toString().slice(0, 7)
    if (!m) continue
    await fetch('/api/cashflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: m, openingCash: +r['Opening Cash CZK'] || 0, cashIn: +r['Cash In CZK'] || 0,
        cashOut: +r['Cash Out CZK'] || 0, endingCash: +r['Ending Cash CZK'] || 0
      })
    })
  }

  // KPI -> /api/kpi
  const k = wb.Sheets['KPIs'] ? XLSX.utils.sheet_to_json(wb.Sheets['KPIs']) as any[] : []
  for (const r of k) {
    const m = (r['Month (YYYY-MM)'] || '').toString().slice(0, 7)
    if (!m) continue
    await fetch('/api/kpi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: m, orders: +r['Orders'] || 0, avgOrderValue: +r['Avg Order Value CZK'] || 0, conversionRate: +r['Conversion Rate %'] || 0
      })
    })
  }

  location.reload()
}

export default function Dashboard() {
  const { data: months } = useSWR('/api/months', fetcher)
  const { data: capex } = useSWR('/api/capex', fetcher)
  const { data: cashflow } = useSWR('/api/cashflow', fetcher)
  const { data: kpi } = useSWR('/api/kpi', fetcher)

  // SAFE pole pro grafy (ať TypeScript nezlobí, když data ještě nejsou)
  const monthsSafe: any[] = Array.isArray(months) ? months : []
  const cashflowSafe: any[] = Array.isArray(cashflow) ? cashflow : []
  const capexSafe: any[] = Array.isArray(capex) ? capex : []

  // Stavy pro "rychlé přidání" řádku
  const [newMonth, setNewMonth] = useState<any>({
    month: '2025-01', revenuePlan: '', revenueActual: '', payroll: '', rent: '', marketing: '',
    fulfillment: '', itAdmin: '', otherOpex: ''
  })
  const [newCapex, setNewCapex] = useState<any>({ date: '2025-01-01', category: '', amount: '', comment: '' })
  const [newCF, setNewCF] = useState<any>({ month: '2025-01', openingCash: '', cashIn: '', cashOut: '', endingCash: '' })
  const [newKPI, setNewKPI] = useState<any>({ month: '2025-01', sessions: '', orders: '', conversionRate: '', avgOrderValue: '' })

  const computed = useMemo(() => {
    return monthsSafe.map((r: any) => {
      const opex = (r.payroll || 0) + (r.rent || 0) + (r.marketing || 0) + (r.fulfillment || 0) + (r.itAdmin || 0) + (r.otherOpex || 0)
      return {
        name: r.month,
        plan: r.revenuePlan || 0,
        actual: r.revenueActual || 0,
        opex,
        ebitdaPlan: (r.revenuePlan || 0) - opex,
        ebitdaActual: (r.revenueActual || 0) - opex,
      }
    })
  }, [monthsSafe])

  const totals = useMemo(() => {
    const sum = (k: string) => computed.reduce((a: number, b: any) => a + (b[k] || 0), 0)
    const be = computed.find((r: any) => r.ebitdaPlan > 0)?.name || '—'
    return {
      revenuePlan: sum('plan'),
      revenueActual: sum('actual'),
      opex: sum('opex'),
      ebitdaPlan: sum('ebitdaPlan'),
      ebitdaActual: sum('ebitdaActual'),
      breakEven: be,
    }
  }, [computed])

  async function save(path: string, body: any, after?: () => void) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      after?.()
      location.reload()
    }
  }

  return (
    <main className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button onClick={DownloadTemplate} className="px-3 py-2 border rounded">Stáhnout XLSX šablonu</button>
          <label className="px-3 py-2 border rounded cursor-pointer">
            Import XLSX
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={e => e.target.files && importXLSX(e.target.files[0])} />
          </label>
          <button onClick={() => signOut({ callbackUrl: '/' })} className="px-3 py-2 border rounded">Odhlásit</button>
        </div>
      </div>

      {/* Souhrny */}
      <div className="grid md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Σ Obrat (plán)</div><div className="text-2xl">{toCZK(totals.revenuePlan)}</div></div>
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Σ Obrat (realita)</div><div className="text-2xl">{toCZK(totals.revenueActual)}</div></div>
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Σ OPEX</div><div className="text-2xl">{toCZK(totals.opex)}</div></div>
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Σ EBITDA (plán)</div><div className="text-2xl">{toCZK(totals.ebitdaPlan)}</div></div>
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Break-even</div><div className="text-2xl">{totals.breakEven}</div></div>
      </div>

      {/* Grafy: Obrat/OPEX a EBITDA */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow h-80">
          <div className="font-medium mb-2">Obrat vs OPEX</div>
          <ResponsiveContainer>
            <LineChart data={computed}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: any) => toCZK(v)} /><Legend />
              <Line type="monotone" dataKey="plan" name="Obrat plán" />
              <Line type="monotone" dataKey="actual" name="Obrat realita" />
              <Line type="monotone" dataKey="opex" name="OPEX" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-4 rounded shadow h-80">
          <div className="font-medium mb-2">EBITDA</div>
          <ResponsiveContainer>
            <BarChart data={computed}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: any) => toCZK(v)} /><Legend />
              <ReferenceLine y={0} />
              <Bar dataKey="ebitdaPlan" name="EBITDA plán" />
              <Bar dataKey="ebitdaActual" name="EBITDA realita" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cash-flow & CAPEX charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow h-80">
          <div className="font-medium mb-2">Cash-flow (In/Out/Ending)</div>
          <ResponsiveContainer>
            <LineChart data={cashflowSafe.map((r: any) => ({ name: r.month, in: r.cashIn, out: r.cashOut, end: r.endingCash }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
              <Line type="monotone" dataKey="in" name="Cash In" />
              <Line type="monotone" dataKey="out" name="Cash Out" />
              <Line type="monotone" dataKey="end" name="Ending Cash" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-4 rounded shadow h-80">
          <div className="font-medium mb-2">CAPEX Timeline</div>
          <ResponsiveContainer>
            <BarChart data={capexSafe.map((r: any) => ({ name: (r.date || '').slice(0, 10), amount: r.amount, category: r.category }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
              <Bar dataKey="amount" name="Investice (CZK)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scénáře */}
      <div className="bg-white p-4 rounded shadow">
        <div className="font-medium mb-2">Scénáře (Best / Base / Worst)</div>
        <p className="text-sm text-gray-600 mb-3">Zadej multiplikátory obratu a OPEX a podívej se, jak to pohne s break-even.</p>
        <ScenarioPanel months={monthsSafe} />
      </div>

      {/* DATA sections */}
      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow space-y-2">
          <div className="font-medium mb-2">Měsíční data (Obrat & OPEX)</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="border p-2 rounded" placeholder="YYYY-MM" value={newMonth.month} onChange={e => setNewMonth({ ...newMonth, month: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Obrat plán" value={newMonth.revenuePlan} onChange={e => setNewMonth({ ...newMonth, revenuePlan: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Obrat realita" value={newMonth.revenueActual} onChange={e => setNewMonth({ ...newMonth, revenueActual: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Payroll" value={newMonth.payroll} onChange={e => setNewMonth({ ...newMonth, payroll: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Rent" value={newMonth.rent} onChange={e => setNewMonth({ ...newMonth, rent: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Marketing" value={newMonth.marketing} onChange={e => setNewMonth({ ...newMonth, marketing: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Fulfillment" value={newMonth.fulfillment} onChange={e => setNewMonth({ ...newMonth, fulfillment: e.target.value })} />
            <input className="border p-2 rounded" placeholder="IT/Admin" value={newMonth.itAdmin} onChange={e => setNewMonth({ ...newMonth, itAdmin: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Other OPEX" value={newMonth.otherOpex} onChange={e => setNewMonth({ ...newMonth, otherOpex: e.target.value })} />
          </div>
          <button
            className="px-3 py-2 rounded bg-black text-white"
            onClick={() =>
              save('/api/months', {
                month: newMonth.month,
                revenuePlan: +newMonth.revenuePlan || 0,
                revenueActual: +newMonth.revenueActual || 0,
                payroll: +newMonth.payroll || 0,
                rent: +newMonth.rent || 0,
                marketing: +newMonth.marketing || 0,
                fulfillment: +newMonth.fulfillment || 0,
                itAdmin: +newMonth.itAdmin || 0,
                otherOpex: +newMonth.otherOpex || 0,
              })
            }
          >
            Uložit měsíc
          </button>
        </div>

        <div className="bg-white p-4 rounded shadow space-y-2">
          <div className="font-medium mb-2">CAPEX</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="border p-2 rounded" type="date" value={newCapex.date} onChange={e => setNewCapex({ ...newCapex, date: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Kategorie" value={newCapex.category} onChange={e => setNewCapex({ ...newCapex, category: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Částka" value={newCapex.amount} onChange={e => setNewCapex({ ...newCapex, amount: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Komentář" value={newCapex.comment} onChange={e => setNewCapex({ ...newCapex, comment: e.target.value })} />
          </div>
          <button
            className="px-3 py-2 rounded bg-black text-white"
            onClick={() =>
              save('/api/capex', {
                date: new Date(newCapex.date),
                category: newCapex.category,
                amount: +newCapex.amount || 0,
                comment: newCapex.comment || ''
              })
            }
          >
            Přidat CAPEX
          </button>
        </div>

        <div className="bg-white p-4 rounded shadow space-y-2">
          <div className="font-medium mb-2">Cash-flow</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="border p-2 rounded" placeholder="YYYY-MM" value={newCF.month} onChange={e => setNewCF({ ...newCF, month: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Opening Cash" value={newCF.openingCash} onChange={e => setNewCF({ ...newCF, openingCash: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Cash In" value={newCF.cashIn} onChange={e => setNewCF({ ...newCF, cashIn: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Cash Out" value={newCF.cashOut} onChange={e => setNewCF({ ...newCF, cashOut: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Ending Cash" value={newCF.endingCash} onChange={e => setNewCF({ ...newCF, endingCash: e.target.value })} />
          </div>
          <button
            className="px-3 py-2 rounded bg-black text-white"
            onClick={() =>
              save('/api/cashflow', {
                month: newCF.month,
                openingCash: +newCF.openingCash || 0,
                cashIn: +newCF.cashIn || 0,
                cashOut: +newCF.cashOut || 0,
                endingCash: +newCF.endingCash || 0,
              })
            }
          >
            Uložit cash-flow
          </button>
        </div>

        <div className="bg-white p-4 rounded shadow space-y-2">
          <div className="font-medium mb-2">KPI</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="border p-2 rounded" placeholder="YYYY-MM" value={newKPI.month} onChange={e => setNewKPI({ ...newKPI, month: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Sessions" value={newKPI.sessions} onChange={e => setNewKPI({ ...newKPI, sessions: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Orders" value={newKPI.orders} onChange={e => setNewKPI({ ...newKPI, orders: e.target.value })} />
            <input className="border p-2 rounded" placeholder="CR (%)" value={newKPI.conversionRate} onChange={e => setNewKPI({ ...newKPI, conversionRate: e.target.value })} />
            <input className="border p-2 rounded" placeholder="AOV (CZK)" value={newKPI.avgOrderValue} onChange={e => setNewKPI({ ...newKPI, avgOrderValue: e.target.value })} />
          </div>
          <button
            className="px-3 py-2 rounded bg-black text-white"
            onClick={() =>
              save('/api/kpi', {
                month: newKPI.month,
                sessions: +newKPI.sessions || 0,
                orders: +newKPI.orders || 0,
                conversionRate: +newKPI.conversionRate || 0,
                avgOrderValue: +newKPI.avgOrderValue || 0,
              })
            }
          >
            Uložit KPI
          </button>
        </div>
      </section>
    </main>
  )
}

/** Jednoduchý panel pro scénáře */
function ScenarioPanel({ months }: { months: any[] }) {
  const [mult, setMult] = useState({ bestRev: 1.3, baseRev: 1.1, worstRev: 0.9, bestOpex: 0.95, baseOpex: 1.0, worstOpex: 1.05 })
  const rows = (months || []).map((r: any) => {
    const opex = (r.payroll || 0) + (r.rent || 0) + (r.marketing || 0) + (r.fulfillment || 0) + (r.itAdmin || 0) + (r.otherOpex || 0)
    return { month: r.month, plan: r.revenuePlan || 0, opex }
  })
  const calc = (revM: number, opM: number) => rows.map(r => ({ month: r.month, ebitda: r.plan * revM - r.opex * opM }))
  const best = calc(mult.bestRev, mult.bestOpex)
  const base = calc(mult.baseRev, mult.baseOpex)
  const worst = calc(mult.worstRev, mult.worstOpex)
  const breakEven = (arr: any[]) => arr.find(r => r.ebitda > 0)?.month || '—'

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <div className="p-3 border rounded">
          <div className="font-medium">Best</div>
          <label className="text-xs">Revenue ×</label>
          <input className="w-full border rounded p-1" value={mult.bestRev} onChange={e => setMult({ ...mult, bestRev: +e.target.value || 1 })} />
          <label className="text-xs">OPEX ×</label>
          <input className="w-full border rounded p-1" value={mult.bestOpex} onChange={e => setMult({ ...mult, bestOpex: +e.target.value || 1 })} />
        </div>
        <div className="p-3 border rounded">
          <div className="font-medium">Base</div>
          <label className="text-xs">Revenue ×</label>
          <input className="w-full border rounded p-1" value={mult.baseRev} onChange={e => setMult({ ...mult, baseRev: +e.target.value || 1 })} />
          <label className="text-xs">OPEX ×</label>
          <input className="w-full border rounded p-1" value={mult.baseOpex} onChange={e => setMult({ ...mult, baseOpex: +e.target.value || 1 })} />
        </div>
        <div className="p-3 border rounded">
          <div className="font-medium">Worst</div>
          <label className="text-xs">Revenue ×</label>
          <input className="w-full border rounded p-1" value={mult.worstRev} onChange={e => setMult({ ...mult, worstRev: +e.target.value || 1 })} />
          <label className="text-xs">OPEX ×</label>
          <input className="w-full border rounded p-1" value={mult.worstOpex} onChange={e => setMult({ ...mult, worstOpex: +e.target.value || 1 })} />
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <div className="p-3 border rounded">Break-even (Best): <b>{breakEven(best)}</b></div>
        <div className="p-3 border rounded">Break-even (Base): <b>{breakEven(base)}</b></div>
        <div className="p-3 border rounded">Break-even (Worst): <b>{breakEven(worst)}</b></div>
      </div>
    </div>
  )
}
